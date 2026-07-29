import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ToolRouterService,
  createToolHandlerRegistry,
  createSchedulingAgentTools,
  CREATE_BOOKING_TOOL_KEY,
  executeCreateBooking,
  resolveLlmToolExposure,
  listRegisteredToolHandlerKeys,
} from "./index.js";
import type { BookingDomainServicePort, SchedulingToolPorts } from "./tools/scheduling-agent-ports.js";
import type { ToolDefinitionRepository, ToolExecutionRepository } from "./repositories/tool-repositories.js";
import type { ConversationReader } from "./ports/conversation-reader.js";
import { BookingDomainError } from "@workspace/scheduling-engine";
import { ToolCallLoopService } from "@workspace/ai-execution-engine";
import type { RuntimeGatewayPort, RuntimeToolPort } from "@workspace/ai-execution-engine";

function createStubSchedulingPorts(
  overrides: Partial<SchedulingToolPorts> = {},
): SchedulingToolPorts {
  return {
    async searchAvailability() {
      return {
        success: true,
        serviceId: "service-1",
        durationMinutes: 30,
        availableDates: [],
        resources: [],
      };
    },
    async createBooking() {
      return { success: false, message: "not configured" };
    },
    ...overrides,
  };
}

function createRouterFixtures(handlers: ReturnType<typeof createToolHandlerRegistry>) {
  const definitionRepository: ToolDefinitionRepository = {
    async findByKey(key) {
      if (key !== CREATE_BOOKING_TOOL_KEY) return null;
      return {
        id: "tool-create-booking",
        key,
        display_name: "Create Booking",
        description: "Create booking",
        category: "scheduling",
        version: "1.0.0",
        is_enabled: true,
        required_permissions: ["tools.execute", "bookings.create"],
        supported_states: ["collecting_information"],
        input_schema: {
          type: "object",
          properties: {
            customerId: { type: "string" },
            serviceId: { type: "string" },
            resourceId: { type: "string" },
            date: { type: "string" },
            slotStart: { type: "string" },
          },
          required: ["customerId", "serviceId", "resourceId", "date", "slotStart"],
        },
        output_schema: { type: "object" },
        timeout_ms: 45000,
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
    async updateEnabled(input) {
      return {
        id: "tool-create-booking",
        key: CREATE_BOOKING_TOOL_KEY,
        display_name: "Create Booking",
        description: "Create booking",
        category: "scheduling",
        version: "1.0.0",
        is_enabled: input.isEnabled,
        required_permissions: ["tools.execute", "bookings.create"],
        supported_states: ["collecting_information"],
        input_schema: { type: "object" },
        output_schema: { type: "object" },
        timeout_ms: 45000,
        retry_policy: { maxAttempts: 1, backoffMs: 0 },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    },
  };

  const executions: Array<{
    id: string;
    company_id: string;
    conversation_id: string;
    tool_definition_id: string;
    tool_key: string;
    input: Record<string, unknown>;
    output: Record<string, unknown> | null;
    status: string;
    error_code: string | null;
    error_message: string | null;
    started_at: string;
    completed_at: string | null;
    duration_ms: number | null;
    triggered_by: string;
    created_by: string | null;
  }> = [];

  const executionRepository: ToolExecutionRepository = {
    async create(input) {
      const record = {
        id: "exec-booking-1",
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
    async markRunning(executionId) {
      const record = executions.find((item) => item.id === executionId)!;
      record.status = "running";
      return record;
    },
    async complete(input) {
      const record = executions.find((item) => item.id === input.executionId)!;
      record.status = input.status;
      record.output = input.output ?? null;
      record.error_code = input.errorCode ?? null;
      record.error_message = input.errorMessage ?? null;
      record.duration_ms = input.durationMs;
      record.completed_at = new Date().toISOString();
      return record;
    },
    async findById(id) {
      return executions.find((item) => item.id === id) ?? null;
    },
    async list() {
      return executions;
    },
  };

  const conversationReader: ConversationReader = {
    async findById(conversationId) {
      return {
        id: conversationId,
        company_id: "company-1",
        state: "collecting_information",
      };
    },
  };

  const router = new ToolRouterService(
    definitionRepository,
    executionRepository,
    conversationReader,
    handlers,
  );

  return { router, executions };
}

describe("create_booking production tool", () => {
  it("registers create_booking and excludes legacy booking mock handler", () => {
    const keys = listRegisteredToolHandlerKeys({
      schedulingToolPorts: createStubSchedulingPorts(),
    });
    assert.ok(keys.includes(CREATE_BOOKING_TOOL_KEY));
    assert.equal(keys.includes("booking"), false);
  });

  it("exposes create_booking to the LLM catalog when scheduling ports are wired", () => {
    const exposure = resolveLlmToolExposure(
      listRegisteredToolHandlerKeys({
        schedulingToolPorts: createStubSchedulingPorts(),
      }),
    );
    assert.ok(exposure.allowedToolKeys.includes(CREATE_BOOKING_TOOL_KEY));
    assert.equal(
      exposure.excludedMocks.some((entry) => entry.key === "booking"),
      true,
    );
  });

  it("creates a booking successfully through BookingDomainService", async () => {
    const domainCalls: Array<Record<string, unknown>> = [];
    const bookingDomain: BookingDomainServicePort = {
      async createBooking(input) {
        domainCalls.push(input as Record<string, unknown>);
        return {
          booking: {
            id: "booking-1",
            status: "confirmed",
            start_at: "2026-08-01T09:00:00.000Z",
            end_at: "2026-08-01T09:30:00.000Z",
            company_id: input.companyId,
          },
        };
      },
    };

    const result = await executeCreateBooking(bookingDomain, {
      companyId: "company-1",
      userId: "user-1",
      customerId: "customer-1",
      serviceId: "service-1",
      resourceId: "resource-1",
      date: "2026-08-01",
      slotStart: "09:00",
    });

    assert.equal(result.success, true);
    assert.equal(result.bookingId, "booking-1");
    assert.equal(domainCalls.length, 1);
    assert.equal(domainCalls[0]?.source, "ai_assistant");
    assert.equal(domainCalls[0]?.createdBy, "user-1");
  });

  it("prevents double booking when domain service reports conflict", async () => {
    const bookingDomain: BookingDomainServicePort = {
      async createBooking() {
        throw new BookingDomainError(["booking_conflict"]);
      },
    };

    const result = await executeCreateBooking(bookingDomain, {
      companyId: "company-1",
      userId: "user-1",
      customerId: "customer-1",
      serviceId: "service-1",
      resourceId: "resource-1",
      date: "2026-08-01",
      slotStart: "09:00",
    });

    assert.equal(result.success, false);
    assert.deepEqual(result.errors, ["booking_conflict"]);
  });

  it("rejects invalid slots from domain validation", async () => {
    const bookingDomain: BookingDomainServicePort = {
      async createBooking() {
        throw new BookingDomainError(["slot_unavailable"]);
      },
    };

    const result = await executeCreateBooking(bookingDomain, {
      companyId: "company-1",
      userId: "user-1",
      customerId: "customer-1",
      serviceId: "service-1",
      resourceId: "resource-1",
      date: "2026-08-01",
      slotStart: "23:59",
    });

    assert.equal(result.success, false);
    assert.deepEqual(result.errors, ["slot_unavailable"]);
  });

  it("enforces tenant isolation via company-scoped domain input", async () => {
    let capturedCompanyId = "";
    const bookingDomain: BookingDomainServicePort = {
      async createBooking(input) {
        capturedCompanyId = input.companyId;
        throw new BookingDomainError(["customer_not_found"]);
      },
    };

    const schedulingToolPorts = createStubSchedulingPorts({
      createBooking(input) {
        return executeCreateBooking(bookingDomain, input);
      },
    });

    const handlers = createToolHandlerRegistry(createSchedulingAgentTools(schedulingToolPorts));

    const definitionRepository: ToolDefinitionRepository = {
      async findByKey(key) {
        if (key !== CREATE_BOOKING_TOOL_KEY) return null;
        return {
          id: "tool-create-booking",
          key,
          display_name: "Create Booking",
          description: "Create booking",
          category: "scheduling",
          version: "1.0.0",
          is_enabled: true,
          required_permissions: ["tools.execute", "bookings.create"],
          supported_states: ["collecting_information"],
          input_schema: { type: "object" },
          output_schema: { type: "object" },
          timeout_ms: 45000,
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
      async updateEnabled(input) {
        return {
          id: "tool-create-booking",
          key: CREATE_BOOKING_TOOL_KEY,
          display_name: "Create Booking",
          description: "Create booking",
          category: "scheduling",
          version: "1.0.0",
          is_enabled: input.isEnabled,
          required_permissions: ["tools.execute", "bookings.create"],
          supported_states: ["collecting_information"],
          input_schema: { type: "object" },
          output_schema: { type: "object" },
          timeout_ms: 45000,
          retry_policy: { maxAttempts: 1, backoffMs: 0 },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      },
    };

    const executionRepository: ToolExecutionRepository = {
      async create(input) {
        return {
          id: "exec-tenant-1",
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
      },
      async markRunning(executionId) {
        return {
          id: executionId,
          company_id: "company-tenant-a",
          conversation_id: "conv-tenant",
          tool_definition_id: "tool-create-booking",
          tool_key: CREATE_BOOKING_TOOL_KEY,
          input: {},
          output: null,
          status: "running",
          error_code: null,
          error_message: null,
          started_at: new Date().toISOString(),
          completed_at: null,
          duration_ms: null,
          triggered_by: "llm",
          created_by: null,
        };
      },
      async complete(input) {
        return {
          id: input.executionId,
          company_id: "company-tenant-a",
          conversation_id: "conv-tenant",
          tool_definition_id: "tool-create-booking",
          tool_key: CREATE_BOOKING_TOOL_KEY,
          input: {},
          output: input.output ?? null,
          status: input.status,
          error_code: input.errorCode ?? null,
          error_message: input.errorMessage ?? null,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          duration_ms: input.durationMs,
          triggered_by: "llm",
          created_by: null,
        };
      },
      async findById() {
        return null;
      },
      async list() {
        return [];
      },
    };

    const conversationReader: ConversationReader = {
      async findById(conversationId) {
        return {
          id: conversationId,
          company_id: "company-tenant-a",
          state: "collecting_information",
        };
      },
    };

    const router = new ToolRouterService(
      definitionRepository,
      executionRepository,
      conversationReader,
      handlers,
    );

    const result = await router.route(
      {
        userId: "user-1",
        companyId: "company-tenant-a",
        isSuperAdmin: false,
        hasPermission: (code) => code === "tools.execute" || code === "bookings.create",
      },
      {
        conversationId: "conv-tenant",
        toolKey: CREATE_BOOKING_TOOL_KEY,
        input: {
          customerId: "customer-other-tenant",
          serviceId: "service-1",
          resourceId: "resource-1",
          date: "2026-08-01",
          slotStart: "09:00",
        },
        triggeredBy: "llm",
      },
    );

    assert.equal(result.status, "succeeded");
    assert.equal(capturedCompanyId, "company-tenant-a");
    assert.deepEqual(result.output?.errors, ["customer_not_found"]);
  });

  it("routes LLM tool calls through BookingDomainService with no mock execution path", async () => {
    const domainCalls: string[] = [];
    const bookingDomain: BookingDomainServicePort = {
      async createBooking() {
        domainCalls.push("createBooking");
        return {
          booking: {
            id: "booking-llm-1",
            status: "confirmed",
            start_at: "2026-08-01T10:00:00.000Z",
            end_at: "2026-08-01T10:30:00.000Z",
            company_id: "company-1",
          },
        };
      },
    };

    const schedulingToolPorts = createStubSchedulingPorts({
      createBooking(input) {
        return executeCreateBooking(bookingDomain, input);
      },
    });

    const handlers = createToolHandlerRegistry(createSchedulingAgentTools(schedulingToolPorts));
    const { router } = createRouterFixtures(handlers);

    const result = await router.route(
      {
        userId: "user-1",
        companyId: "company-1",
        isSuperAdmin: false,
        hasPermission: (code) => code === "tools.execute" || code === "bookings.create",
      },
      {
        conversationId: "conv-1",
        toolKey: CREATE_BOOKING_TOOL_KEY,
        input: {
          customerId: "customer-1",
          serviceId: "service-1",
          resourceId: "resource-1",
          date: "2026-08-01",
          slotStart: "10:00",
        },
        triggeredBy: "llm",
      },
    );

    assert.equal(result.status, "succeeded");
    assert.equal(result.output?.bookingId, "booking-llm-1");
    assert.deepEqual(domainCalls, ["createBooking"]);
    assert.equal(domainCalls.includes("booking-mock-1" as never), false);
  });

  it("delivers create_booking results to the LLM tool loop", async () => {
    const tools: RuntimeToolPort = {
      async route(_ctx, input) {
        return {
          executionId: "exec-1",
          toolKey: input.toolKey,
          status: "succeeded",
          output: {
            success: true,
            bookingId: "booking-loop-1",
            status: "confirmed",
          },
          durationMs: 4,
        };
      },
      listLlmTools() {
        return [
          {
            type: "function",
            function: {
              name: CREATE_BOOKING_TOOL_KEY,
              description: "Create booking",
              parameters: {
                type: "object",
                properties: {
                  customerId: { type: "string" },
                  serviceId: { type: "string" },
                  resourceId: { type: "string" },
                  date: { type: "string" },
                  slotStart: { type: "string" },
                },
                required: ["customerId", "serviceId", "resourceId", "date", "slotStart"],
              },
            },
          },
        ];
      },
      allowedToolKeys() {
        return [CREATE_BOOKING_TOOL_KEY];
      },
    };

    const gateway: RuntimeGatewayPort = {
      async chatCompletion(input) {
        if (!input.messages.some((message) => message.role === "tool")) {
          return {
            text: "",
            model: "mock",
            providerKey: "mock",
            finishReason: "tool_calls",
            usage: { inputTokens: 1, outputTokens: 0, totalTokens: 1 },
            latencyMs: 1,
            toolCalls: [
              {
                id: "call-1",
                name: CREATE_BOOKING_TOOL_KEY,
                arguments: {
                  customerId: "customer-1",
                  serviceId: "service-1",
                  resourceId: "resource-1",
                  date: "2026-08-02",
                  slotStart: "10:00",
                },
              },
            ],
          };
        }

        return {
          text: "Booking confirmed.",
          model: "mock",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
          latencyMs: 2,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: {
        userId: "user-1",
        companyId: "company-1",
        isSuperAdmin: false,
        hasPermission: () => true,
      },
      conversationId: "conv-1",
      gatewayRequest: {
        messages: [{ role: "user", content: "Book 10am tomorrow" }],
        model: "mock",
      },
      tools: tools.listLlmTools(),
      allowedToolKeys: tools.allowedToolKeys(),
    });

    assert.match(result.response.text, /confirmed/i);
  });
});
