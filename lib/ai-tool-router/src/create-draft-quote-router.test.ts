import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ConversationReader } from "./ports/conversation-reader.js";
import type { ToolDefinitionRepository, ToolExecutionRepository } from "./repositories/tool-repositories.js";
import { ToolRouterService } from "./services/tool-router-service.js";
import { buildToolHandlers } from "./tool-handler-registry.js";
import { createToolHandlerRegistry } from "./tools/tool-contract.js";
import type { QuoteAgentToolPorts, QuoteDraftToolResult } from "./tools/quote-agent-ports.js";
import type { ServiceContext, ToolDefinitionRecord, ToolExecutionRecord } from "./types.js";
import {
  CREATE_DRAFT_QUOTE_TOOL_KEY,
  GET_QUOTE_DELIVERY_STATUS_TOOL_KEY,
  REQUEST_SEND_QUOTE_TOOL_KEY,
} from "./tools/quote-tool-definitions.js";
import { TOOL_REGISTRY } from "./llm-tool-catalog.js";

function withDraftPorts(
  createDraftQuoteFromVerifiedInterest: QuoteAgentToolPorts["createDraftQuoteFromVerifiedInterest"],
): QuoteAgentToolPorts {
  return {
    createDraftQuoteFromVerifiedInterest,
    async requestSendQuote() {
      throw new Error("not used");
    },
    async getQuoteDeliveryStatus() {
      throw new Error("not used");
    },
  };
}

const COMPANY = "aaaaaaaa-0000-4000-8000-000000000001";

function definition(overrides?: Partial<ToolDefinitionRecord>): ToolDefinitionRecord {
  return {
    id: "def-create-draft-quote",
    key: CREATE_DRAFT_QUOTE_TOOL_KEY,
    display_name: "Create Draft Quote",
    description: "draft only",
    category: "sales",
    version: "1.0.0",
    is_enabled: true,
    required_permissions: ["tools.execute", "quotes.create"],
    supported_states: [
      "idle",
      "greeting",
      "collecting_information",
      "waiting_user",
      "waiting_api",
      "transferred_to_human",
    ],
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        quantity: { type: "number" },
        productId: { type: "string" },
      },
    },
    output_schema: { type: "object" },
    timeout_ms: 20000,
    retry_policy: { maxAttempts: 1, backoffMs: 500 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function createRouter(ports: QuoteAgentToolPorts, def = definition()) {
  const executions: ToolExecutionRecord[] = [];
  const definitions: ToolDefinitionRepository = {
    listEnabled: async () => (def.is_enabled ? [def] : []),
    listAll: async () => [def],
    findById: async (id) => (def.id === id ? def : null),
    findByKey: async (key) => (def.key === key ? def : null),
    updateEnabled: async () => {
      throw new Error("not used");
    },
  };
  const executionRepository: ToolExecutionRepository = {
    create: async (input) => {
      const record = {
        id: `exec-${executions.length + 1}`,
        company_id: input.companyId,
        conversation_id: input.conversationId,
        tool_definition_id: input.toolDefinitionId,
        tool_key: input.toolKey,
        input: input.input,
        output: null,
        status: "pending",
        error_code: null,
        error_message: null,
        started_at: new Date().toISOString(),
        completed_at: null,
        duration_ms: null,
        triggered_by: input.triggeredBy ?? "router",
        created_by: input.createdBy ?? null,
      } as ToolExecutionRecord;
      executions.push(record);
      return record;
    },
    markRunning: async (id) => executions.find((entry) => entry.id === id)!,
    complete: async (input) => {
      const record = executions.find((entry) => entry.id === input.executionId)!;
      record.status = input.status;
      record.output = input.output ?? null;
      record.error_code = input.errorCode ?? null;
      return record;
    },
    findById: async (id) => executions.find((entry) => entry.id === id) ?? null,
    list: async () => executions,
  };
  const conversations: ConversationReader = {
    findById: async (id) => ({
      id,
      company_id: COMPANY,
      state: "waiting_user",
      customer_id: null,
    }),
  };
  const router = new ToolRouterService(
    definitions,
    executionRepository,
    conversations,
    createToolHandlerRegistry(buildToolHandlers({ quoteAgentPorts: ports })),
  );
  return { router, executions };
}

function ctx(permissions: string[]): ServiceContext {
  return {
    userId: "ai-employee",
    companyId: COMPANY,
    isSuperAdmin: false,
    hasPermission: (code) => permissions.includes(code),
  };
}

const successDraft: QuoteDraftToolResult = {
  ok: true,
  created: true,
  alreadyExists: false,
  draftOnly: true,
  status: "draft",
  quoteId: "quote-1",
  quoteNumber: "Q-100",
  opportunityId: "opp-1",
  leadId: "lead-1",
  productId: "prod-1",
  productName: "Clinic Pack",
  quantity: 1,
  currency: "EGP",
  grandTotal: 499.9,
  unitPrice: 499.9,
  priceSource: "global",
  priceSourceNote: "global note",
  message: "Internal draft quote created successfully. It was NOT sent to the customer and is NOT approved.",
};

describe("create_draft_quote through ToolRouterService", () => {
  it("matches TOOL_REGISTRY required permissions used by the seed", () => {
    const entry = TOOL_REGISTRY.find((tool) => tool.key === CREATE_DRAFT_QUOTE_TOOL_KEY);
    assert.ok(entry);
    assert.deepEqual(entry!.requiredPermissions, ["tools.execute", "quotes.create"]);
    assert.equal(entry!.classification, "production_ready");
  });

  it("registers the handler when quoteAgentPorts are wired", () => {
    const keys = Object.keys(buildToolHandlers({ quoteAgentPorts: {} as QuoteAgentToolPorts })).sort();
    assert.deepEqual(keys, [
      CREATE_DRAFT_QUOTE_TOOL_KEY,
      GET_QUOTE_DELIVERY_STATUS_TOOL_KEY,
      REQUEST_SEND_QUOTE_TOOL_KEY,
    ].sort());
  });

  it("succeeds with tools.execute + quotes.create and returns draft-only payload", async () => {
    let calls = 0;
    const { router, executions } = createRouter(
      withDraftPorts(async () => {
        calls += 1;
        return successDraft;
      }),
    );
    const result = await router.route(ctx(["tools.execute", "quotes.create"]), {
      conversationId: "conv-1",
      toolKey: CREATE_DRAFT_QUOTE_TOOL_KEY,
      input: {},
    });
    assert.equal(result.status, "succeeded");
    assert.equal(calls, 1);
    const output = result.output as Record<string, unknown>;
    assert.equal(output.success, true);
    assert.equal(output.draftOnly, true);
    assert.equal(output.status, "draft");
    assert.equal(output.sent, false);
    assert.equal(output.approved, false);
    assert.equal(output.quoteNumber, "Q-100");
    assert.equal(executions[0]?.status, "succeeded");
  });

  it("returns alreadyExists reuse without claiming send", async () => {
    const { router } = createRouter(
      withDraftPorts(async () => ({
        ...successDraft,
        created: false,
        alreadyExists: true,
        message:
          "An internal draft quote already exists for this opportunity and product. It was NOT sent and is NOT approved.",
      })),
    );
    const result = await router.route(ctx(["tools.execute", "quotes.create"]), {
      conversationId: "conv-1",
      toolKey: CREATE_DRAFT_QUOTE_TOOL_KEY,
      input: { quantity: 1 },
    });
    assert.equal(result.status, "succeeded");
    const output = result.output as Record<string, unknown>;
    assert.equal(output.alreadyExists, true);
    assert.equal(output.created, false);
    assert.equal(output.sent, false);
  });

  it("denies without quotes.create and never calls the port", async () => {
    let called = false;
    const { router } = createRouter(
      withDraftPorts(async () => {
        called = true;
        return successDraft;
      }),
    );
    const result = await router.route(ctx(["tools.execute"]), {
      conversationId: "conv-1",
      toolKey: CREATE_DRAFT_QUOTE_TOOL_KEY,
      input: {},
    });
    assert.equal(result.status, "denied");
    assert.equal(result.errorCode, "PERMISSION_DENIED");
    assert.equal(called, false);
  });

  it("does not treat quotes.send / approve / delete as sufficient", async () => {
    let called = false;
    const { router } = createRouter(
      withDraftPorts(async () => {
        called = true;
        return successDraft;
      }),
    );
    const result = await router.route(
      ctx(["tools.execute", "quotes.send", "quotes.approve", "quotes.delete", "quotes.view", "quotes.edit"]),
      {
        conversationId: "conv-1",
        toolKey: CREATE_DRAFT_QUOTE_TOOL_KEY,
        input: {},
      },
    );
    assert.equal(result.status, "denied");
    assert.equal(result.errorCode, "PERMISSION_DENIED");
    assert.equal(called, false);
  });
});
