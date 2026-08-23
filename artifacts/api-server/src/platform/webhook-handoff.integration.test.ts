/**
 * Phase 5F — webhook Human Handoff ToolRouter wiring.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ToolRouterService,
  createHandoffAgentTools,
  createToolHandlerRegistry,
  listRegisteredToolHandlerKeys,
  type ConversationReader,
  type HandoffAgentToolPorts,
  type ToolDefinitionRepository,
  type ToolExecutionRepository,
} from "@workspace/ai-tool-router";
import { createWebhookToolRouterIntegrations } from "./create-webhook-tool-router-integrations.js";
import { createWebhookAiEmployeeServiceContext } from "./webhook-ai-employee-auth-context.js";

const HANDOFF_TOOLS = ["escalate_to_human", "queue_handoff", "return_to_ai"] as const;

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

function createRecordingHandoffPorts(): HandoffAgentToolPorts & {
  calls: Array<{ method: string; input: Record<string, unknown> }>;
} {
  const calls: Array<{ method: string; input: Record<string, unknown> }> = [];
  return {
    calls,
    async escalateToHuman(input) {
      calls.push({ method: "escalateToHuman", input: { ...input } });
      return {
        requestId: "req-escalate-1",
        ownership: { ownerType: "queue", ownerLabel: "Support" },
      };
    },
    async queueForHuman(input) {
      calls.push({ method: "queueForHuman", input: { ...input } });
      return { queuePosition: 2, estimatedWaitSeconds: 120 };
    },
    async returnToAi(input) {
      calls.push({ method: "returnToAi", input: { ...input } });
      return { ownership: { ownerType: "ai_employee" } };
    },
  };
}

function createDefinitionRepository(toolKey: string, requiredPermissions: string[]): ToolDefinitionRepository {
  return {
    async findByKey(key) {
      if (key !== toolKey) return null;
      return {
        id: `def-${toolKey}`,
        key: toolKey,
        display_name: toolKey,
        description: toolKey,
        category: "handoff",
        version: "1.0.0",
        is_enabled: true,
        required_permissions: requiredPermissions,
        supported_states: ["waiting_user", "greeting", "collecting_information", "waiting_api", "transferred_to_human"],
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
        tool_key: "escalate_to_human",
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
        tool_key: "escalate_to_human",
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

describe("Phase 5F webhook Human Handoff wiring", () => {
  it("TEST 1 — handoff tools are registered on webhook ToolRouter", () => {
    const { createOptions, tools } = createWebhookToolRouterIntegrations(
      createMockSupabaseClient() as never,
    );
    const registered = listRegisteredToolHandlerKeys(createOptions);
    for (const key of HANDOFF_TOOLS) {
      assert.ok(registered.includes(key), `missing handler ${key}`);
      assert.ok(tools.allowedToolKeys().includes(key), `missing allowed key ${key}`);
    }
  });

  it("TEST 2 — ToolRouter routes each handoff tool to handoffAgentPorts", async () => {
    const ports = createRecordingHandoffPorts();
    const handlers = createHandoffAgentTools(ports);
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

    const cases: Array<{
      toolKey: (typeof HANDOFF_TOOLS)[number];
      permission: string;
      input: Record<string, unknown>;
      method: string;
      state?: "waiting_user" | "transferred_to_human";
    }> = [
      {
        toolKey: "escalate_to_human",
        permission: "handoff.escalate",
        input: { reason: "Customer asked for a human" },
        method: "escalateToHuman",
      },
      {
        toolKey: "queue_handoff",
        permission: "handoff.queue",
        input: { queueId: "queue-1", reason: "Need specialist" },
        method: "queueForHuman",
      },
      {
        toolKey: "return_to_ai",
        permission: "handoff.return_to_ai",
        input: { reason: "Issue resolved by human" },
        method: "returnToAi",
        state: "transferred_to_human",
      },
    ];

    for (const testCase of cases) {
      ports.calls.length = 0;
      const reader: ConversationReader = {
        async findById() {
          return {
            id: "conv-1",
            company_id: "company-a",
            state: testCase.state ?? "waiting_user",
            customer_id: "customer-a",
          };
        },
      };
      const router = new ToolRouterService(
        createDefinitionRepository(testCase.toolKey, ["tools.execute", testCase.permission]),
        createExecutionRepository(),
        reader,
        createToolHandlerRegistry({ [testCase.toolKey]: handlers[testCase.toolKey]! }),
      );

      const ctx = createWebhookAiEmployeeServiceContext({
        companyId: "company-a",
        userId: "actor-1",
      });
      assert.equal(ctx.isSuperAdmin, false);

      const result = await router.route(ctx, {
        conversationId: "conv-1",
        toolKey: testCase.toolKey,
        input: testCase.input,
      });

      assert.equal(result.status, "succeeded", testCase.toolKey);
      assert.equal(ports.calls.length, 1, testCase.toolKey);
      assert.equal(ports.calls[0]?.method, testCase.method);
      assert.equal(ports.calls[0]?.input.companyId, "company-a");
      assert.equal(ports.calls[0]?.input.conversationId, "conv-1");
    }

    void conversationReader;
  });

  it("TEST 8 — conversation identity comes from trusted runtime, not LLM companyId", async () => {
    const ports = createRecordingHandoffPorts();
    const handlers = createHandoffAgentTools(ports);
    const router = new ToolRouterService(
      createDefinitionRepository("escalate_to_human", ["tools.execute", "handoff.escalate"]),
      createExecutionRepository(),
      {
        async findById() {
          return {
            id: "conv-1",
            company_id: "company-a",
            state: "waiting_user",
            customer_id: null,
          };
        },
      },
      createToolHandlerRegistry({ escalate_to_human: handlers.escalate_to_human! }),
    );

    const ctx = createWebhookAiEmployeeServiceContext({
      companyId: "company-a",
      userId: "actor-1",
    });

    const result = await router.route(ctx, {
      conversationId: "conv-1",
      toolKey: "escalate_to_human",
      input: {
        reason: "Need human",
        companyId: "company-b",
        conversationId: "conv-attacker",
        customerId: "customer-b",
      },
    });

    assert.equal(result.status, "succeeded");
    assert.equal(ports.calls[0]?.input.companyId, "company-a");
    assert.equal(ports.calls[0]?.input.conversationId, "conv-1");
    assert.equal("customerId" in (ports.calls[0]?.input ?? {}), false);
  });

  it("TEST 7/10 — missing company context denied; product ctx is not SYSTEM_CONTEXT super-admin", async () => {
    const ports = createRecordingHandoffPorts();
    const handlers = createHandoffAgentTools(ports);
    const router = new ToolRouterService(
      createDefinitionRepository("escalate_to_human", ["tools.execute", "handoff.escalate"]),
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
      createToolHandlerRegistry({ escalate_to_human: handlers.escalate_to_human! }),
    );

    const noCompany = createWebhookAiEmployeeServiceContext({
      companyId: null,
      userId: "actor-1",
    });
    await assert.rejects(
      () =>
        router.route(noCompany, {
          conversationId: "conv-1",
          toolKey: "escalate_to_human",
          input: { reason: "Need human" },
        }),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        (error as { code: string }).code === "TENANT_CONTEXT_MISSING",
    );
    assert.equal(ports.calls.length, 0);

    const productCtx = createWebhookAiEmployeeServiceContext({
      companyId: "company-a",
      userId: "actor-1",
    });
    assert.equal(productCtx.isSuperAdmin, false);
    assert.equal(productCtx.hasPermission("platform.admin"), false);
    assert.equal(productCtx.hasPermission("handoff.escalate"), true);
  });

  it("TEST 13 — end-to-end code path reaches handoff domain boundary", async () => {
    let escalateReached = false;
    const ports: HandoffAgentToolPorts = {
      async escalateToHuman(input) {
        escalateReached = true;
        assert.equal(input.companyId, "company-a");
        assert.equal(input.conversationId, "conv-1");
        assert.equal(input.reason, "Customer requested agent");
        return {
          requestId: "req-live-path",
          ownership: { ownerType: "queue", ownerLabel: "Tier-1" },
        };
      },
      async queueForHuman() {
        throw new Error("unused");
      },
      async returnToAi() {
        throw new Error("unused");
      },
    };

    const router = new ToolRouterService(
      createDefinitionRepository("escalate_to_human", ["tools.execute", "handoff.escalate"]),
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
      createToolHandlerRegistry(createHandoffAgentTools(ports)),
    );

    const ctx = createWebhookAiEmployeeServiceContext({
      companyId: "company-a",
      userId: "company-owner-1",
    });

    const result = await router.route(ctx, {
      conversationId: "conv-1",
      toolKey: "escalate_to_human",
      input: { reason: "Customer requested agent", triggerCode: "customer_requested" },
    });

    assert.equal(result.status, "succeeded");
    assert.equal(escalateReached, true);
    assert.equal((result.output as { requestId?: string } | null)?.requestId, "req-live-path");
  });
});
