import type { ConversationState } from "@workspace/ai-conversation";
import type { Tool, ToolExecutionContext } from "./tool-contract.js";
import type { SchedulingToolPorts } from "./scheduling-agent-ports.js";
import { validateAgainstSchema } from "../utils/tool-utils.js";

const ACTIVE_STATES: ConversationState[] = [
  "idle",
  "greeting",
  "collecting_information",
  "waiting_user",
  "waiting_api",
  "transferred_to_human",
];

function requireUser(context: ToolExecutionContext): string {
  if (!context.userId) throw new Error("Authentication required.");
  return context.userId;
}

function createSearchAvailabilityTool(ports: SchedulingToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: {
            serviceId: { type: "string" },
            resourceId: { type: "string" },
            branchId: { type: "string" },
            date: { type: "string", description: "YYYY-MM-DD" },
            daysAhead: { type: "number" },
          },
          required: ["serviceId"],
        },
        input,
      );
    },
    async execute(context, input) {
      const userId = requireUser(context);
      const result = await ports.searchAvailability({
        companyId: context.companyId,
        userId,
        serviceId: String(input.serviceId),
        resourceId: typeof input.resourceId === "string" ? input.resourceId : undefined,
        branchId: typeof input.branchId === "string" ? input.branchId : undefined,
        date: typeof input.date === "string" ? input.date : undefined,
        daysAhead: typeof input.daysAhead === "number" ? input.daysAhead : undefined,
      });

      return {
        success: result.success,
        serviceId: result.serviceId,
        durationMinutes: result.durationMinutes,
        availableDates: result.availableDates,
        resources: result.resources,
        message: result.message ?? null,
      };
    },
  };
}

function createCreateBookingTool(ports: SchedulingToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: {
            customerId: { type: "string" },
            serviceId: { type: "string" },
            resourceId: { type: "string" },
            date: { type: "string", description: "YYYY-MM-DD" },
            slotStart: { type: "string", description: "HH:mm local wall time" },
            branchId: { type: "string" },
            notes: { type: "string" },
          },
          required: ["customerId", "serviceId", "resourceId", "date", "slotStart"],
        },
        input,
      );
    },
    async execute(context, input) {
      const userId = requireUser(context);
      const result = await ports.createBooking({
        companyId: context.companyId,
        userId,
        customerId: String(input.customerId),
        serviceId: String(input.serviceId),
        resourceId: String(input.resourceId),
        date: String(input.date),
        slotStart: String(input.slotStart),
        branchId: typeof input.branchId === "string" ? input.branchId : undefined,
        notes: typeof input.notes === "string" ? input.notes : undefined,
      });

      if (!result.success) {
        return {
          success: false,
          errors: result.errors ?? [],
          message: result.message ?? "Booking could not be created.",
        };
      }

      return {
        success: true,
        bookingId: result.bookingId,
        status: result.status,
        startAt: result.startAt,
        endAt: result.endAt,
      };
    },
  };
}

export function createSchedulingAgentTools(ports: SchedulingToolPorts): Record<string, Tool> {
  return {
    search_availability: createSearchAvailabilityTool(ports),
    create_booking: createCreateBookingTool(ports),
  };
}

export const SEARCH_AVAILABILITY_TOOL_KEY = "search_availability";
export const CREATE_BOOKING_TOOL_KEY = "create_booking";
