/**
 * Phase 5H — webhook check_in / check_out registration + product-context path.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHECK_IN_TOOL_KEY,
  CHECK_OUT_TOOL_KEY,
  ToolRouterService,
  createSchedulingAgentTools,
  createToolHandlerRegistry,
  listRegisteredToolHandlerKeys,
  type ConversationReader,
  type SchedulingToolPorts,
  type ToolDefinitionRepository,
  type ToolExecutionRepository,
} from "@workspace/ai-tool-router";
import { createWebhookToolRouterIntegrations } from "./create-webhook-tool-router-integrations.js";
import { createWebhookAiEmployeeServiceContext } from "./webhook-ai-employee-auth-context.js";

function createMockSupabaseClient() {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
    }),
  };
}

function createDefinitionRepository(toolKey: string): ToolDefinitionRepository {
  return {
    async findByKey(key) {
      if (key !== toolKey) return null;
      return {
        id: `def-${toolKey}`,
        key: toolKey,
        display_name: toolKey,
        description: toolKey,
        category: "scheduling",
        version: "1.0.0",
        is_enabled: true,
        required_permissions: ["tools.execute", "bookings.edit"],
        supported_states: ["waiting_user", "greeting", "collecting_information", "waiting_api"],
        input_schema: { type: "object", properties: {} },
        output_schema: { type: "object" },
        timeout_ms: 5000,
        retry_policy: { maxAttempts: 1, backoffMs: 0 },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    },
    async listEnabled() {
      return [];
    },
    async listAll() {
      return [];
    },
    async findById() {
      return null;
    },
    async updateEnabled() {
      throw new Error("unused");
    },
  };
}

function createExecutionRepository(): ToolExecutionRepository {
  return {
    async create(input) {
      return {
        id: "exec-1",
        company_id: input.companyId,
        conversation_id: input.conversationId,
        tool_definition_id: input.toolDefinitionId,
        tool_key: input.toolKey,
        input: input.input,
        triggered_by: input.triggeredBy,
        status: "running",
        output: null,
        error_code: null,
        error_message: null,
        duration_ms: null,
        started_at: new Date().toISOString(),
        completed_at: null,
        created_by: input.createdBy,
      };
    },
    async markRunning(executionId) {
      return {
        id: executionId,
        company_id: "company-a",
        conversation_id: "conv-1",
        tool_definition_id: "def-1",
        tool_key: CHECK_IN_TOOL_KEY,
        input: {},
        triggered_by: "router",
        status: "running",
        output: null,
        error_code: null,
        error_message: null,
        duration_ms: null,
        started_at: new Date().toISOString(),
        completed_at: null,
        created_by: "actor-1",
      };
    },
    async complete(input) {
      return {
        id: input.executionId,
        company_id: "company-a",
        conversation_id: "conv-1",
        tool_definition_id: "def-1",
        tool_key: CHECK_IN_TOOL_KEY,
        input: {},
        triggered_by: "router",
        status: input.status,
        output: input.output ?? null,
        error_code: input.errorCode ?? null,
        error_message: input.errorMessage ?? null,
        duration_ms: input.durationMs,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        created_by: "actor-1",
      };
    },
  };
}

describe("Phase 5H webhook check_in / check_out wiring", () => {
  it("TEST A — check_in and check_out registered on webhook ToolRouter", () => {
    const { createOptions, tools } = createWebhookToolRouterIntegrations(
      createMockSupabaseClient() as never,
    );
    const registered = listRegisteredToolHandlerKeys(createOptions);
    assert.ok(registered.includes(CHECK_IN_TOOL_KEY));
    assert.ok(registered.includes(CHECK_OUT_TOOL_KEY));
    assert.ok(tools.allowedToolKeys().includes(CHECK_IN_TOOL_KEY));
    assert.ok(tools.allowedToolKeys().includes(CHECK_OUT_TOOL_KEY));
  });

  it("TEST end-to-end — product context routes check_in to scheduling port", async () => {
    let reached = false;
    const ports = {
      async checkInBooking(input: {
        companyId: string;
        bookingId: string;
        trustedCustomerId?: string | null;
      }) {
        reached = true;
        assert.equal(input.companyId, "company-a");
        assert.equal(input.bookingId, "booking-a");
        assert.equal(input.trustedCustomerId, "customer-a");
        return {
          success: true,
          bookingId: "booking-a",
          checkedInAt: "2026-08-20T10:05:00.000Z",
          status: "checked_in",
        };
      },
      async checkOutBooking() {
        throw new Error("unused");
      },
    } as unknown as SchedulingToolPorts;

    const handlers = createSchedulingAgentTools(ports);
    const conversationReader: ConversationReader = {
      async findById() {
        return {
          id: "conv-1",
          company_id: "company-a",
          state: "waiting_user",
          customer_id: "customer-a",
        };
      },
    };

    const router = new ToolRouterService(
      createDefinitionRepository(CHECK_IN_TOOL_KEY),
      createExecutionRepository(),
      conversationReader,
      createToolHandlerRegistry({ [CHECK_IN_TOOL_KEY]: handlers[CHECK_IN_TOOL_KEY]! }),
    );

    const ctx = createWebhookAiEmployeeServiceContext({
      companyId: "company-a",
      userId: "actor-1",
    });
    assert.equal(ctx.isSuperAdmin, false);

    const result = await router.route(ctx, {
      conversationId: "conv-1",
      toolKey: CHECK_IN_TOOL_KEY,
      input: { bookingId: "booking-a", companyId: "company-b" },
    });

    assert.equal(result.status, "succeeded");
    assert.equal(reached, true);
    assert.equal((result.output as { status?: string } | null)?.status, "checked_in");
  });

  it("missing company product context fails closed", async () => {
    const ports = {
      async checkInBooking() {
        throw new Error("should not run");
      },
    } as unknown as SchedulingToolPorts;
    const handlers = createSchedulingAgentTools(ports);
    const router = new ToolRouterService(
      createDefinitionRepository(CHECK_IN_TOOL_KEY),
      createExecutionRepository(),
      {
        async findById() {
          return {
            id: "conv-1",
            company_id: "company-a",
            state: "waiting_user",
            customer_id: "customer-a",
          };
        },
      },
      createToolHandlerRegistry({ [CHECK_IN_TOOL_KEY]: handlers[CHECK_IN_TOOL_KEY]! }),
    );

    const noCompany = createWebhookAiEmployeeServiceContext({
      companyId: null,
      userId: "actor-1",
    });
    await assert.rejects(
      () =>
        router.route(noCompany, {
          conversationId: "conv-1",
          toolKey: CHECK_IN_TOOL_KEY,
          input: { bookingId: "booking-a" },
        }),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        (error as { code: string }).code === "TENANT_CONTEXT_MISSING",
    );
  });
});
