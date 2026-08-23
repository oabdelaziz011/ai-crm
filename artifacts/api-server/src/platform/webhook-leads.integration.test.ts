/**
 * Phase 5G — webhook Leads ToolRouter wiring.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LEAD_TOOL_KEYS,
  ToolRouterService,
  createLeadAgentTools,
  createToolHandlerRegistry,
  listRegisteredToolHandlerKeys,
  type ConversationReader,
  type LeadAgentToolPorts,
  type ToolDefinitionRepository,
  type ToolExecutionRepository,
} from "@workspace/ai-tool-router";
import { createWebhookToolRouterIntegrations } from "./create-webhook-tool-router-integrations.js";
import { createWebhookAiEmployeeServiceContext } from "./webhook-ai-employee-auth-context.js";

const LEAD_PERMISSION_BY_TOOL: Record<(typeof LEAD_TOOL_KEYS)[number], string> = {
  create_lead: "leads.create",
  update_lead: "leads.edit",
  qualify_lead: "leads.qualify",
  convert_lead: "leads.convert",
  assign_lead: "leads.assign",
  search_lead: "leads.view",
  merge_lead: "leads.merge",
  score_lead: "leads.edit",
  suggest_next_action: "leads.view",
};

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

function sampleLead(overrides: Record<string, unknown> = {}) {
  return {
    id: "lead-1",
    title: "Prospect",
    contactName: "Ada",
    email: "ada@example.com",
    phone: null,
    lifecycleStatus: "new",
    score: 10,
    isQualified: false,
    customerId: null,
    conversationId: "conv-1",
    ...overrides,
  };
}

function createRecordingLeadPorts(): LeadAgentToolPorts & {
  calls: Array<{ method: string; input: Record<string, unknown> }>;
} {
  const calls: Array<{ method: string; input: Record<string, unknown> }> = [];
  const lead = sampleLead();
  return {
    calls,
    async createLead(input) {
      calls.push({ method: "createLead", input: { ...input } });
      return { lead: sampleLead({ title: input.title, conversationId: input.conversationId }) as never };
    },
    async updateLead(input) {
      calls.push({ method: "updateLead", input: { ...input } });
      return { lead: { ...lead, ...input } as never };
    },
    async qualifyLead(input) {
      calls.push({ method: "qualifyLead", input: { ...input } });
      return { lead: sampleLead({ isQualified: true, lifecycleStatus: "qualified" }) as never };
    },
    async convertLead(input) {
      calls.push({ method: "convertLead", input: { ...input } });
      return { lead: sampleLead({ lifecycleStatus: "converted", customerId: "cust-1" }) as never, customerId: "cust-1" };
    },
    async assignLead(input) {
      calls.push({ method: "assignLead", input: { ...input } });
      return { lead: lead as never };
    },
    async searchLeads(input) {
      calls.push({ method: "searchLeads", input: { ...input } });
      return { leads: [lead as never], total: 1 };
    },
    async mergeLeads(input) {
      calls.push({ method: "mergeLeads", input: { ...input } });
      return { lead: lead as never };
    },
    async scoreLead(input) {
      calls.push({ method: "scoreLead", input: { ...input } });
      return { lead: sampleLead({ score: input.score }) as never };
    },
    async suggestNextAction(input) {
      calls.push({ method: "suggestNextAction", input: { ...input } });
      return { suggestion: "Qualify the lead", lead: lead as never };
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
        category: "sales",
        version: "1.0.0",
        is_enabled: true,
        required_permissions: requiredPermissions,
        supported_states: ["waiting_user", "greeting", "collecting_information", "waiting_api", "idle"],
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
        tool_key: "create_lead",
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
        tool_key: "create_lead",
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

function toolInputFor(toolKey: (typeof LEAD_TOOL_KEYS)[number]): Record<string, unknown> {
  switch (toolKey) {
    case "create_lead":
      return { title: "New prospect" };
    case "update_lead":
      return { leadId: "lead-1", title: "Updated" };
    case "qualify_lead":
      return { leadId: "lead-1", score: 80 };
    case "convert_lead":
      return { leadId: "lead-1" };
    case "assign_lead":
      return { leadId: "lead-1", assigneeUserId: "user-2" };
    case "search_lead":
      return { query: "Ada" };
    case "merge_lead":
      return { primaryLeadId: "lead-1", duplicateLeadIds: ["lead-2"] };
    case "score_lead":
      return { leadId: "lead-1", score: 55 };
    case "suggest_next_action":
      return { leadId: "lead-1" };
    default:
      return {};
  }
}

describe("Phase 5G webhook Leads wiring", () => {
  it("TEST A — all LEAD_TOOL_KEYS are registered on webhook ToolRouter", () => {
    const { createOptions, tools } = createWebhookToolRouterIntegrations(
      createMockSupabaseClient() as never,
    );
    const registered = listRegisteredToolHandlerKeys(createOptions);
    for (const key of LEAD_TOOL_KEYS) {
      assert.ok(registered.includes(key), `missing handler ${key}`);
      assert.ok(tools.allowedToolKeys().includes(key), `missing allowed key ${key}`);
    }
  });

  it("TEST B — ToolRouter routes each lead tool to leadAgentPorts", async () => {
    const ports = createRecordingLeadPorts();
    const handlers = createLeadAgentTools(ports);

    for (const toolKey of LEAD_TOOL_KEYS) {
      ports.calls.length = 0;
      const router = new ToolRouterService(
        createDefinitionRepository(toolKey, ["tools.execute", LEAD_PERMISSION_BY_TOOL[toolKey]]),
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
        createToolHandlerRegistry({ [toolKey]: handlers[toolKey]! }),
      );

      const ctx = createWebhookAiEmployeeServiceContext({
        companyId: "company-a",
        userId: "actor-1",
      });
      assert.equal(ctx.isSuperAdmin, false);

      const result = await router.route(ctx, {
        conversationId: "conv-1",
        toolKey,
        input: toolInputFor(toolKey),
      });

      assert.equal(result.status, "succeeded", toolKey);
      assert.equal(ports.calls.length, 1, toolKey);
      assert.equal(ports.calls[0]?.input.companyId, "company-a", toolKey);
    }
  });

  it("TEST F/G — missing company denied; product ctx is not SYSTEM_CONTEXT super-admin", async () => {
    const ports = createRecordingLeadPorts();
    const handlers = createLeadAgentTools(ports);
    const router = new ToolRouterService(
      createDefinitionRepository("create_lead", ["tools.execute", "leads.create"]),
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
      createToolHandlerRegistry({ create_lead: handlers.create_lead! }),
    );

    const noCompany = createWebhookAiEmployeeServiceContext({
      companyId: null,
      userId: "actor-1",
    });
    await assert.rejects(
      () =>
        router.route(noCompany, {
          conversationId: "conv-1",
          toolKey: "create_lead",
          input: { title: "X" },
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
    assert.equal(productCtx.hasPermission("leads.create"), true);
  });

  it("TEST H — LLM companyId/conversationId cannot override trusted context", async () => {
    const ports = createRecordingLeadPorts();
    const handlers = createLeadAgentTools(ports);
    const router = new ToolRouterService(
      createDefinitionRepository("create_lead", ["tools.execute", "leads.create"]),
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
      createToolHandlerRegistry({ create_lead: handlers.create_lead! }),
    );

    const ctx = createWebhookAiEmployeeServiceContext({
      companyId: "company-a",
      userId: "actor-1",
    });

    const result = await router.route(ctx, {
      conversationId: "conv-1",
      toolKey: "create_lead",
      input: {
        title: "Attack",
        companyId: "company-b",
        conversationId: "conv-attacker",
      },
    });

    assert.equal(result.status, "succeeded");
    assert.equal(ports.calls[0]?.input.companyId, "company-a");
    assert.equal(ports.calls[0]?.input.conversationId, "conv-1");
  });

  it("TEST end-to-end — webhook product path reaches lead domain boundary", async () => {
    let createReached = false;
    const ports: LeadAgentToolPorts = {
      async createLead(input) {
        createReached = true;
        assert.equal(input.companyId, "company-a");
        assert.equal(input.userId, "company-owner-1");
        assert.equal(input.conversationId, "conv-1");
        assert.equal(input.title, "WhatsApp prospect");
        return { lead: sampleLead({ title: input.title }) as never };
      },
      async updateLead() {
        throw new Error("unused");
      },
      async qualifyLead() {
        throw new Error("unused");
      },
      async convertLead() {
        throw new Error("unused");
      },
      async assignLead() {
        throw new Error("unused");
      },
      async searchLeads() {
        throw new Error("unused");
      },
      async mergeLeads() {
        throw new Error("unused");
      },
      async scoreLead() {
        throw new Error("unused");
      },
      async suggestNextAction() {
        throw new Error("unused");
      },
    };

    const router = new ToolRouterService(
      createDefinitionRepository("create_lead", ["tools.execute", "leads.create"]),
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
      } satisfies ConversationReader,
      createToolHandlerRegistry(createLeadAgentTools(ports)),
    );

    const ctx = createWebhookAiEmployeeServiceContext({
      companyId: "company-a",
      userId: "company-owner-1",
    });

    const result = await router.route(ctx, {
      conversationId: "conv-1",
      toolKey: "create_lead",
      input: { title: "WhatsApp prospect" },
    });

    assert.equal(result.status, "succeeded");
    assert.equal(createReached, true);
  });
});
