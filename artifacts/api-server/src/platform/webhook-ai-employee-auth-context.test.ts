/**
 * Phase 5E — webhook AI Employee auth context (product vs technical privilege).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createWebhookAiEmployeeServiceContext,
  isWebhookAiEmployeeToolPermission,
  WEBHOOK_AI_EMPLOYEE_PERMISSION_ALLOWLIST,
} from "./webhook-ai-employee-auth-context.js";
import { createChannelRuntimePort } from "./channel-platform-ports.js";
import type { RuntimeIntegrationServices } from "@workspace/runtime-integration";
import { ToolRouterService, createToolHandlerRegistry } from "@workspace/ai-tool-router";
import type { Tool } from "@workspace/ai-tool-router";
import type { ConversationReader } from "@workspace/ai-tool-router";
import type { ToolDefinitionRepository, ToolExecutionRepository } from "@workspace/ai-tool-router";

type CapturedRuntimeCtx = {
  isSuperAdmin?: boolean;
  hasPermission?: (c: string) => boolean;
  companyId?: string | null;
  userId?: string | null;
};

function createMinimalDefinitionRepository(
  requiredPermissions: string[],
): ToolDefinitionRepository {
  return {
    async findByKey(toolKey) {
      if (toolKey !== "faq") return null;
      return {
        id: "def-1",
        key: "faq",
        display_name: "FAQ",
        description: "faq",
        category: "support",
        version: "1.0.0",
        is_enabled: true,
        required_permissions: requiredPermissions,
        supported_states: ["waiting_user"],
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

function createMinimalExecutionRepository(): ToolExecutionRepository {
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
        tool_key: "faq",
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
        tool_key: "faq",
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

describe("Phase 5E webhook AI Employee auth context", () => {
  it("TEST 1 — never product super-admin; allowlist is not blanket true", () => {
    const ctx = createWebhookAiEmployeeServiceContext({
      companyId: "company-a",
      userId: "actor-1",
    });
    assert.equal(ctx.isSuperAdmin, false);
    assert.equal(ctx.hasPermission("tools.execute"), true);
    assert.equal(ctx.hasPermission("tickets.create"), true);
    assert.equal(ctx.hasPermission("ai.conversations.view"), true);
    assert.equal(ctx.hasPermission("ai.conversations.reply"), true);
    assert.equal(ctx.hasPermission("intents.view"), true);
    assert.equal(ctx.hasPermission("prompts.view"), true);
    assert.equal(ctx.hasPermission("ai.providers.view"), true);
    assert.equal(ctx.hasPermission("channel.platform.dispatch"), true);
    assert.equal(ctx.hasPermission("ai.conversations.takeover"), false);
    assert.equal(ctx.hasPermission("intents.manage"), false);
    assert.equal(ctx.hasPermission("prompts.manage"), false);
    assert.equal(ctx.hasPermission("platform.admin"), false);
    assert.equal(ctx.hasPermission("companies.delete"), false);
    assert.equal(ctx.hasPermission("totally.unknown.permission"), false);
    assert.ok(WEBHOOK_AI_EMPLOYEE_PERMISSION_ALLOWLIST.has("tools.execute"));
    assert.ok(WEBHOOK_AI_EMPLOYEE_PERMISSION_ALLOWLIST.has("ai.conversations.reply"));
    assert.ok(WEBHOOK_AI_EMPLOYEE_PERMISSION_ALLOWLIST.has("intents.view"));
    assert.equal(isWebhookAiEmployeeToolPermission("billing.admin"), false);
  });

  it("TEST 5 — missing company or actor → hasPermission fail-closed", () => {
    const noCompany = createWebhookAiEmployeeServiceContext({
      companyId: null,
      userId: "actor-1",
    });
    assert.equal(noCompany.hasPermission("tools.execute"), false);

    const noUser = createWebhookAiEmployeeServiceContext({
      companyId: "company-a",
      userId: null,
    });
    assert.equal(noUser.hasPermission("tools.execute"), false);
  });

  it("channel runtime execute does not inherit SYSTEM_CONTEXT super-admin", async () => {
    let captured: CapturedRuntimeCtx | undefined;
    const runtimeServices = {
      coordinator: {
        execute: async (ctx: CapturedRuntimeCtx) => {
          captured = ctx;
          return {
            executionId: "runtime-1",
            responseContent: { text: "ok" },
            correlationId: "corr-1",
          };
        },
      },
    } as unknown as RuntimeIntegrationServices;

    const port = createChannelRuntimePort(
      runtimeServices,
      {
        userId: null,
        companyId: null,
        isSuperAdmin: true,
        hasPermission: () => true,
      },
      {
        resolveRuntimeActorUserId: async () => "company-owner-1",
      },
    );

    await port.execute({
      companyId: "company-a",
      conversationId: "conv-1",
      messageText: "hello",
      runtimeConfig: {
        providerConnectionId: null,
        knowledgeRetrieval: undefined,
        executionPolicy: undefined,
        pageContext: undefined,
      },
      correlationId: "corr-1",
    } as never);

    assert.ok(captured);
    assert.equal(captured.isSuperAdmin, false);
    assert.equal(captured.companyId, "company-a");
    assert.equal(captured.userId, "company-owner-1");
    assert.equal(captured.hasPermission!("tools.execute"), true);
    assert.equal(captured.hasPermission!("ai.conversations.reply"), true);
    assert.equal(captured.hasPermission!("platform.admin"), false);
  });

  it("TEST 9 — ToolRouter succeeds with AI Employee context (no super-admin) when permissions allowlisted", async () => {
    const faqTool: Tool = {
      supports: () => true,
      validate() {},
      async execute() {
        return { answer: "ok" };
      },
    };

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
      createMinimalDefinitionRepository(["tools.execute"]),
      createMinimalExecutionRepository(),
      conversationReader,
      createToolHandlerRegistry({ faq: faqTool }),
    );

    const ctx = createWebhookAiEmployeeServiceContext({
      companyId: "company-a",
      userId: "actor-1",
    });

    const result = await router.route(ctx, {
      conversationId: "conv-1",
      toolKey: "faq",
      input: {},
    });

    assert.equal(result.status, "succeeded");
    assert.equal(ctx.isSuperAdmin, false);
  });

  it("ToolRouter denies missing product permission without super-admin bypass", async () => {
    const faqTool: Tool = {
      supports: () => true,
      validate() {},
      async execute() {
        return { answer: "secret" };
      },
    };

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
      createMinimalDefinitionRepository(["tools.execute", "platform.admin"]),
      createMinimalExecutionRepository(),
      conversationReader,
      createToolHandlerRegistry({ faq: faqTool }),
    );

    const ctx = createWebhookAiEmployeeServiceContext({
      companyId: "company-a",
      userId: "actor-1",
    });

    const result = await router.route(ctx, {
      conversationId: "conv-1",
      toolKey: "faq",
      input: {},
    });

    assert.equal(result.status, "denied");
    assert.equal(result.errorCode, "PERMISSION_DENIED");
  });
});
