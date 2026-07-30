import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createSchedulingAgentTools,
  FIND_NEXT_AVAILABLE_TOOL_KEY,
  resolveLlmToolExposure,
  listRegisteredToolHandlerKeys,
} from "./index.js";
import type { SchedulingToolPorts } from "./tools/scheduling-agent-ports.js";

function createStubSchedulingPorts(
  overrides: Partial<SchedulingToolPorts> = {},
): SchedulingToolPorts {
  return {
    async searchAvailability() {
      return {
        success: false,
        serviceId: "service-1",
        durationMinutes: 30,
        availableDates: [],
        resources: [],
        searchedWindow: 7,
        nextSuggestion: 14,
        message: "No appointments are available during the next 7 days.",
      };
    },
    async findNextAvailable() {
      return {
        success: true,
        searchedWindow: 7,
        slot: {
          date: "2026-08-01",
          start: "09:00",
          end: "09:30",
          resourceId: "resource-1",
          resourceName: "Dr. Ada",
          serviceId: "service-1",
          durationMinutes: 30,
          capacity: 1,
          timezone: "UTC",
        },
      };
    },
    async recommendAppointment() {
      return {
        success: true,
        searchedWindow: 7,
        recommendations: [],
        alternativeResource: null,
        alternativeBranch: null,
        nearestDate: null,
      };
    },
    async createBooking() {
      return { success: false, message: "not configured" };
    },
    ...overrides,
  };
}

describe("find_next_available production tool", () => {
  it("registers find_next_available with scheduling agent handlers", () => {
    const keys = listRegisteredToolHandlerKeys({ schedulingToolPorts: createStubSchedulingPorts() });
    assert.ok(keys.includes(FIND_NEXT_AVAILABLE_TOOL_KEY));
  });

  it("exposes find_next_available to the LLM catalog when scheduling ports are wired", () => {
    const exposure = resolveLlmToolExposure(
      listRegisteredToolHandlerKeys({ schedulingToolPorts: createStubSchedulingPorts() }),
    );
    assert.ok(exposure.allowedToolKeys.includes(FIND_NEXT_AVAILABLE_TOOL_KEY));
  });

  it("returns the first bookable slot from scheduling ports", async () => {
    const tools = createSchedulingAgentTools(createStubSchedulingPorts());
    const tool = tools[FIND_NEXT_AVAILABLE_TOOL_KEY];
    assert.ok(tool);

    const output = await tool.execute(
      {
        userId: "user-1",
        companyId: "company-1",
        conversationId: "conv-1",
        isSuperAdmin: false,
        hasPermission: () => true,
      },
      { serviceId: "service-1", daysAhead: 7 },
    );

    assert.equal(output.success, true);
    assert.equal(output.slot?.date, "2026-08-01");
    assert.equal(output.slot?.start, "09:00");
  });
});
