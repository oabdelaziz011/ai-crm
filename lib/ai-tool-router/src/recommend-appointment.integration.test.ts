import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createSchedulingAgentTools,
  RECOMMEND_APPOINTMENT_TOOL_KEY,
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
        message: "No appointments are available during the next 7 days.",
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
        success: true,
        searchedWindow: 7,
        recommendations: [
          {
            resourceId: "resource-2",
            resourceName: "Dr Sarah",
            branchId: "branch-1",
            branchName: "Main",
            serviceId: "service-1",
            date: "2026-07-29",
            start: "16:00",
            end: "16:30",
            displayTime: "4:00 PM",
            durationMinutes: 30,
            capacity: 1,
            timezone: "UTC",
            score: 70,
            reason: "Alternative resource with earliest availability",
            factors: {
              sameResource: 0,
              sameDay: 30,
              sameBranch: 20,
              preferredHours: 0,
              branchChange: 0,
              resourceChange: -20,
            },
          },
        ],
        alternativeResource: {
          requestedResource: { id: "resource-1", name: "Dr Ahmed" },
          recommendedResource: { id: "resource-2", name: "Dr Sarah" },
          reason: "Requested resource has no availability in the search window",
          earliestSlot: {
            date: "2026-07-29",
            start: "16:00",
            end: "16:30",
            resourceId: "resource-2",
            resourceName: "Dr Sarah",
            branchId: "branch-1",
            branchName: "Main",
          },
        },
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

describe("recommend_appointment production tool", () => {
  it("registers recommend_appointment with scheduling agent handlers", () => {
    const keys = listRegisteredToolHandlerKeys({ schedulingToolPorts: createStubSchedulingPorts() });
    assert.ok(keys.includes(RECOMMEND_APPOINTMENT_TOOL_KEY));
  });

  it("exposes recommend_appointment to the LLM catalog when scheduling ports are wired", () => {
    const exposure = resolveLlmToolExposure(
      listRegisteredToolHandlerKeys({ schedulingToolPorts: createStubSchedulingPorts() }),
    );
    assert.ok(exposure.allowedToolKeys.includes(RECOMMEND_APPOINTMENT_TOOL_KEY));
  });

  it("returns ranked recommendations and alternative resource from scheduling ports", async () => {
    const tools = createSchedulingAgentTools(createStubSchedulingPorts());
    const tool = tools[RECOMMEND_APPOINTMENT_TOOL_KEY];
    assert.ok(tool);

    const output = await tool.execute(
      {
        userId: "user-1",
        companyId: "company-1",
        conversationId: "conv-1",
        isSuperAdmin: false,
        hasPermission: () => true,
      },
      {
        serviceId: "service-1",
        preferredResourceId: "resource-1",
        preferredDate: "2026-07-30",
        preferredTime: "09:00",
        daysAhead: 7,
      },
    );

    assert.equal(output.success, true);
    assert.equal(output.recommendations.length, 1);
    assert.equal(output.recommendations[0]?.resourceName, "Dr Sarah");
    assert.equal(output.alternativeResource?.recommendedResource.name, "Dr Sarah");
    assert.equal(output.alternativeResource?.earliestSlot.start, "16:00");
  });
});
