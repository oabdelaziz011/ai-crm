import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PermissionDeniedError, ToolDisabledError, ToolStateNotSupportedError } from "../errors.js";
import type { ConversationReader } from "../ports/conversation-reader.js";
import type { ToolDefinitionRepository, ToolExecutionRepository } from "../repositories/tool-repositories.js";
import { ToolRouterService } from "../services/tool-router-service.js";
import type {
  ServiceContext,
  ToolDefinitionRecord,
  ToolExecutionRecord,
} from "../types.js";
import type { Tool } from "../tools/tool-contract.js";
import { createToolHandlerRegistry } from "../tools/tool-contract.js";

const baseDefinition: ToolDefinitionRecord = {
  id: "tool-1",
  key: "faq",
  display_name: "FAQ",
  description: "FAQ tool",
  category: "knowledge",
  version: "1.0.0",
  is_enabled: true,
  required_permissions: ["tools.execute"],
  supported_states: ["greeting", "waiting_user", "waiting_api"],
  input_schema: {
    type: "object",
    properties: { question: { type: "string" } },
    required: ["question"],
  },
  output_schema: { type: "object" },
  timeout_ms: 5000,
  retry_policy: { maxAttempts: 1, backoffMs: 0 },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function createContext(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code) => code === "tools.execute" || code === "tools.view",
    ...overrides,
  };
}

function createMemoryStores(options?: {
  definition?: Partial<ToolDefinitionRecord>;
  conversationState?: ToolDefinitionRecord["supported_states"][number];
}) {
  const definition = { ...baseDefinition, ...options?.definition };
  const conversationState = options?.conversationState ?? "greeting";
  const executions: ToolExecutionRecord[] = [];

  const definitionRepository: ToolDefinitionRepository = {
    listEnabled: async () => [definition],
    listAll: async () => [definition],
    findById: async () => definition,
    findByKey: async (key) => (key === definition.key ? definition : null),
    updateEnabled: async (input) => ({ ...definition, is_enabled: input.isEnabled }),
  };

  const executionRepository: ToolExecutionRepository = {
    create: async (input) => {
      const record: ToolExecutionRecord = {
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
      };
      executions.push(record);
      return record;
    },
    markRunning: async (executionId) => {
      const record = executions.find((item) => item.id === executionId);
      if (!record) {
        throw new Error(`Execution ${executionId} not found`);
      }
      record.status = "running";
      return record;
    },
    complete: async (input) => {
      const record = executions.find((item) => item.id === input.executionId);
      if (!record) {
        throw new Error(`Execution ${input.executionId} not found`);
      }
      record.status = input.status;
      record.output = input.output ?? null;
      record.error_code = input.errorCode ?? null;
      record.error_message = input.errorMessage ?? null;
      record.duration_ms = input.durationMs;
      record.completed_at = new Date().toISOString();
      return record;
    },
    findById: async (id) => executions.find((item) => item.id === id) ?? null,
    list: async () => executions,
  };

  const conversationReader: ConversationReader = {
    findById: async (conversationId) => ({
      id: conversationId,
      company_id: "company-1",
      state: conversationState,
    }),
  };

  return { definitionRepository, executionRepository, conversationReader, executions };
}

describe("ToolRouterService", () => {
  it("routes a supported tool and records a successful execution", async () => {
    const { definitionRepository, executionRepository, conversationReader, executions } =
      createMemoryStores();

    const handler: Tool = {
      supports: (state) => state === "greeting",
      validate: () => undefined,
      execute: async () => ({ answer: "Mock answer" }),
    };

    const router = new ToolRouterService(
      definitionRepository,
      executionRepository,
      conversationReader,
      createToolHandlerRegistry({ faq: handler }),
    );

    const result = await router.route(createContext(), {
      conversationId: "conv-1",
      toolKey: "faq",
      input: { question: "Hours?" },
    });

    assert.equal(result.status, "succeeded");
    assert.equal(result.output?.answer, "Mock answer");
    assert.equal(executions.length, 1);
    assert.equal(executions[0]?.status, "succeeded");
    assert.ok((executions[0]?.duration_ms ?? 0) >= 0);
  });

  it("denies execution when required permissions are missing", async () => {
    const { definitionRepository, executionRepository, conversationReader } = createMemoryStores({
      definition: { required_permissions: ["tools.execute", "tools.manage"] },
    });
    const handler: Tool = {
      supports: () => true,
      validate: () => undefined,
      execute: async () => ({}),
    };

    const router = new ToolRouterService(
      definitionRepository,
      executionRepository,
      conversationReader,
      createToolHandlerRegistry({ faq: handler }),
    );

    const result = await router.route(
      createContext({ hasPermission: (code) => code === "tools.execute" }),
      {
        conversationId: "conv-1",
        toolKey: "faq",
        input: { question: "Hours?" },
      },
    );

    assert.equal(result.status, "denied");
    assert.equal(result.errorCode, "PERMISSION_DENIED");
  });

  it("allows legacy customers.update alias for customers.edit tool requirement", async () => {
    const { definitionRepository, executionRepository, conversationReader } = createMemoryStores({
      definition: {
        key: "update_customer",
        required_permissions: ["tools.execute", "customers.edit"],
        input_schema: {
          type: "object",
          properties: {
            customerId: { type: "string" },
            field: { type: "string" },
            value: { type: "string" },
          },
          required: ["customerId", "field", "value"],
        },
      },
    });
    const handler: Tool = {
      supports: () => true,
      validate: () => undefined,
      execute: async () => ({ success: true, customerId: "cust-1" }),
    };

    const router = new ToolRouterService(
      definitionRepository,
      executionRepository,
      conversationReader,
      createToolHandlerRegistry({ update_customer: handler }),
    );

    const result = await router.route(
      createContext({
        hasPermission: (code) => code === "tools.execute" || code === "customers.update",
      }),
      {
        conversationId: "conv-1",
        toolKey: "update_customer",
        input: { customerId: "cust-1", field: "phone", value: "+966501234567" },
      },
    );

    assert.equal(result.status, "succeeded");
  });

  it("rejects disabled tools before creating an execution", async () => {
    const { definitionRepository, executionRepository, conversationReader } = createMemoryStores({
      definition: { is_enabled: false },
    });

    const router = new ToolRouterService(
      definitionRepository,
      executionRepository,
      conversationReader,
      createToolHandlerRegistry({
        faq: {
          supports: () => true,
          validate: () => undefined,
          execute: async () => ({}),
        },
      }),
    );

    await assert.rejects(
      () =>
        router.route(createContext(), {
          conversationId: "conv-1",
          toolKey: "faq",
          input: { question: "Hours?" },
        }),
      ToolDisabledError,
    );
  });

  it("rejects unsupported conversation states", async () => {
    const { definitionRepository, executionRepository, conversationReader } = createMemoryStores({
      conversationState: "closed",
    });

    const router = new ToolRouterService(
      definitionRepository,
      executionRepository,
      conversationReader,
      createToolHandlerRegistry({
        faq: {
          supports: (state) => state === "greeting",
          validate: () => undefined,
          execute: async () => ({}),
        },
      }),
    );

    await assert.rejects(
      () =>
        router.route(createContext(), {
          conversationId: "conv-1",
          toolKey: "faq",
          input: { question: "Hours?" },
        }),
      ToolStateNotSupportedError,
    );
  });

  it("records timeout failures without throwing", async () => {
    const { definitionRepository, executionRepository, conversationReader } = createMemoryStores({
      definition: { timeout_ms: 20, retry_policy: { maxAttempts: 1, backoffMs: 0 } },
    });

    const router = new ToolRouterService(
      definitionRepository,
      executionRepository,
      conversationReader,
      createToolHandlerRegistry({
        faq: {
          supports: () => true,
          validate: () => undefined,
          execute: async () => {
            await new Promise((resolve) => setTimeout(resolve, 100));
            return {};
          },
        },
      }),
    );

    const result = await router.route(createContext(), {
      conversationId: "conv-1",
      toolKey: "faq",
      input: { question: "Hours?" },
    });

    assert.equal(result.status, "timeout");
    assert.equal(result.errorCode, "TOOL_TIMEOUT");
  });
});

describe("RBAC guardrails", () => {
  it("throws when execute permission is missing before routing", async () => {
    const { definitionRepository, executionRepository, conversationReader } = createMemoryStores();
    const router = new ToolRouterService(
      definitionRepository,
      executionRepository,
      conversationReader,
      createToolHandlerRegistry({
        faq: {
          supports: () => true,
          validate: () => undefined,
          execute: async () => ({}),
        },
      }),
    );

    await assert.rejects(
      () =>
        router.route(createContext({ hasPermission: () => false }), {
          conversationId: "conv-1",
          toolKey: "faq",
          input: { question: "Hours?" },
        }),
      PermissionDeniedError,
    );
  });
});
