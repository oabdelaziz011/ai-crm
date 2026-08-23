import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ToolRouterService,
  createToolHandlerRegistry,
  createSchedulingAgentTools,
  SEARCH_AVAILABILITY_TOOL_KEY,
  resolveLlmToolExposure,
  listRegisteredToolHandlerKeys,
} from "./index.js";
import type { SchedulingToolPorts } from "./tools/scheduling-agent-ports.js";
import type { ToolDefinitionRepository, ToolExecutionRepository } from "./repositories/tool-repositories.js";
import type { ConversationReader } from "./ports/conversation-reader.js";

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
    async findNextAvailable() {
      return {
        success: false,
        searchedWindow: 7,
        slot: null,
        message: "No bookable appointments were found during the next 7 days.",
      };
    },
    async recommendAppointment() {
      return {
        success: false,
        searchedWindow: 7,
        recommendations: [],
        alternativeResource: null,
        alternativeBranch: null,
        nearestDate: null,
        message: "No recommendations available.",
      };
    },
    async createBooking() {
      return { success: false, message: "not configured" };
    },
    async searchBookings() {
      return { success: true, bookings: [], total: 0 };
    },
    async rescheduleBooking() {
      return { success: false, message: "not configured" };
    },
    async cancelBooking() {
      return { success: false, message: "not configured" };
    },
    async checkInBooking() {
      return { success: false, message: "not configured" };
    },
    async checkOutBooking() {
      return { success: false, message: "not configured" };
    },
    ...overrides,
  };
}

describe("search_availability production tool", () => {
  it("registers search_availability and excludes appointment_lookup mock handler", () => {
    const keys = listRegisteredToolHandlerKeys({ schedulingToolPorts: createStubSchedulingPorts() });
    assert.ok(keys.includes(SEARCH_AVAILABILITY_TOOL_KEY));
    assert.equal(keys.includes("appointment_lookup"), false);
  });

  it("exposes search_availability to the LLM catalog when scheduling ports are wired", () => {
    const exposure = resolveLlmToolExposure(
      listRegisteredToolHandlerKeys({ schedulingToolPorts: createStubSchedulingPorts() }),
    );
    assert.ok(exposure.allowedToolKeys.includes(SEARCH_AVAILABILITY_TOOL_KEY));
    assert.equal(
      exposure.excludedMocks.some((entry) => entry.key === "appointment_lookup"),
      false,
    );
  });

  it("routes through SlotGenerationEngine and AvailabilityEngine via scheduling ports", async () => {
    const engineCalls: string[] = [];

    const schedulingToolPorts: SchedulingToolPorts = createStubSchedulingPorts({
      async searchAvailability(input) {
        engineCalls.push("searchAvailability");
        assert.equal(input.companyId, "company-1");
        assert.equal(input.serviceId, "service-1");
        return {
          success: true,
          serviceId: input.serviceId,
          durationMinutes: 30,
          availableDates: ["2026-08-01"],
          resources: [
            {
              resourceId: "resource-1",
              resourceName: "Dr. Ada",
              durationMinutes: 30,
              capacity: 1,
              availableDates: ["2026-08-01"],
              slots: [{ date: "2026-08-01", start: "09:00", end: "09:30" }],
            },
          ],
        };
      },
    });

    const handlers = createToolHandlerRegistry(createSchedulingAgentTools(schedulingToolPorts));

    const definitionRepository: ToolDefinitionRepository = {
      async findByKey(key) {
        if (key !== SEARCH_AVAILABILITY_TOOL_KEY) return null;
        return {
          id: "tool-search-availability",
          key,
          display_name: "Search Availability",
          description: "Search availability",
          category: "scheduling",
          version: "1.0.0",
          is_enabled: true,
          required_permissions: ["tools.execute", "availability.search"],
          supported_states: ["collecting_information"],
          input_schema: {
            type: "object",
            properties: { serviceId: { type: "string" } },
            required: ["serviceId"],
          },
          output_schema: { type: "object" },
          timeout_ms: 20000,
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
          id: "tool-search-availability",
          key: SEARCH_AVAILABILITY_TOOL_KEY,
          display_name: "Search Availability",
          description: "Search availability",
          category: "scheduling",
          version: "1.0.0",
          is_enabled: input.isEnabled,
          required_permissions: ["tools.execute", "availability.search"],
          supported_states: ["collecting_information"],
          input_schema: { type: "object" },
          output_schema: { type: "object" },
          timeout_ms: 20000,
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
          id: "exec-1",
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
          customer_id: null,
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
        companyId: "company-1",
        isSuperAdmin: false,
        hasPermission: (code) => code === "tools.execute" || code === "availability.search",
      },
      {
        conversationId: "conv-1",
        toolKey: SEARCH_AVAILABILITY_TOOL_KEY,
        input: { serviceId: "service-1", date: "2026-08-01" },
        triggeredBy: "llm",
      },
    );

    assert.equal(result.status, "succeeded");
    assert.deepEqual(result.output?.availableDates, ["2026-08-01"]);
    assert.equal(engineCalls.length, 1);
  });
});
