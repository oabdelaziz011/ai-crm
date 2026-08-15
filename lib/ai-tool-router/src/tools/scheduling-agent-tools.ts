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
            daysAhead: { type: "number", description: "Days to scan when date omitted (default 7, max 90)" },
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
        searchedWindow: result.searchedWindow ?? null,
        nextSuggestion: result.nextSuggestion ?? null,
      };
    },
  };
}

function createFindNextAvailableTool(ports: SchedulingToolPorts): Tool {
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
            daysAhead: { type: "number", description: "Days to scan (default 7, max 90)" },
          },
          required: ["serviceId"],
        },
        input,
      );
    },
    async execute(context, input) {
      const userId = requireUser(context);
      const result = await ports.findNextAvailable({
        companyId: context.companyId,
        userId,
        serviceId: String(input.serviceId),
        resourceId: typeof input.resourceId === "string" ? input.resourceId : undefined,
        branchId: typeof input.branchId === "string" ? input.branchId : undefined,
        daysAhead: typeof input.daysAhead === "number" ? input.daysAhead : undefined,
      });

      return {
        success: result.success,
        searchedWindow: result.searchedWindow,
        nextSuggestion: result.nextSuggestion ?? null,
        message: result.message ?? null,
        slot: result.slot,
      };
    },
  };
}

function createRecommendAppointmentTool(ports: SchedulingToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: {
            serviceId: { type: "string" },
            preferredResourceId: { type: "string" },
            preferredBranchId: { type: "string" },
            preferredDate: { type: "string", description: "YYYY-MM-DD" },
            preferredTime: { type: "string", description: "HH:mm local wall time" },
            daysAhead: { type: "number", description: "Days to scan (default 7, max 90)" },
          },
          required: ["serviceId"],
        },
        input,
      );
    },
    async execute(context, input) {
      const userId = requireUser(context);
      const result = await ports.recommendAppointment({
        companyId: context.companyId,
        userId,
        serviceId: String(input.serviceId),
        preferredResourceId: typeof input.preferredResourceId === "string" ? input.preferredResourceId : undefined,
        preferredBranchId: typeof input.preferredBranchId === "string" ? input.preferredBranchId : undefined,
        preferredDate: typeof input.preferredDate === "string" ? input.preferredDate : undefined,
        preferredTime: typeof input.preferredTime === "string" ? input.preferredTime : undefined,
        daysAhead: typeof input.daysAhead === "number" ? input.daysAhead : undefined,
      });

      return {
        success: result.success,
        searchedWindow: result.searchedWindow,
        recommendations: result.recommendations,
        alternativeResource: result.alternativeResource,
        alternativeBranch: result.alternativeBranch,
        nearestDate: result.nearestDate,
        message: result.message ?? null,
        nextSuggestion: result.nextSuggestion ?? null,
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
          customerFacingMessage:
            result.message?.includes("already booked") ||
            result.errors?.includes("booking_conflict") ||
            result.errors?.includes("slot_unavailable")
              ? "الموعد ده محجوز أو غير متاح. اختار معاد تاني."
              : "ما قدرناش نكمّل الحجز. جرّب معاد أو بيانات تانية.",
          instruction:
            "Tell the customer the booking failed using customerFacingMessage. Do not claim the booking succeeded.",
        };
      }

      return {
        success: true,
        bookingId: result.bookingId,
        status: result.status,
        startAt: result.startAt,
        endAt: result.endAt,
        instruction:
          "Confirm the booking to the customer only because create_booking succeeded. Include bookingId if helpful.",
      };
    },
  };
}

function createSearchBookingsTool(ports: SchedulingToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: {
            customerId: { type: "string" },
            daysBack: { type: "number", description: "Days of history to include (default 30)" },
          },
        },
        input,
      );
    },
    async execute(context, input) {
      const userId = requireUser(context);
      const result = await ports.searchBookings({
        companyId: context.companyId,
        userId,
        customerId: typeof input.customerId === "string" ? input.customerId : undefined,
        daysBack: typeof input.daysBack === "number" ? input.daysBack : undefined,
      });

      return {
        success: result.success,
        bookings: result.bookings,
        total: result.total,
        message: result.message ?? null,
      };
    },
  };
}

function createRescheduleBookingTool(ports: SchedulingToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: {
            bookingId: { type: "string" },
            date: { type: "string", description: "YYYY-MM-DD" },
            slotStart: { type: "string", description: "HH:mm local wall time" },
            reason: { type: "string" },
          },
          required: ["bookingId", "date", "slotStart"],
        },
        input,
      );
    },
    async execute(context, input) {
      const userId = requireUser(context);
      const result = await ports.rescheduleBooking({
        companyId: context.companyId,
        userId,
        bookingId: String(input.bookingId),
        date: String(input.date),
        slotStart: String(input.slotStart),
        reason: typeof input.reason === "string" ? input.reason : undefined,
      });

      if (!result.success) {
        return {
          success: false,
          errors: result.errors ?? [],
          message: result.message ?? "Booking could not be rescheduled.",
        };
      }

      return {
        success: true,
        bookingId: result.bookingId,
        scheduledAt: result.scheduledAt,
        rescheduledAt: result.rescheduledAt,
      };
    },
  };
}

function createCancelBookingTool(ports: SchedulingToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: {
            bookingId: { type: "string" },
            reason: { type: "string" },
          },
          required: ["bookingId"],
        },
        input,
      );
    },
    async execute(context, input) {
      const userId = requireUser(context);
      const result = await ports.cancelBooking({
        companyId: context.companyId,
        userId,
        bookingId: String(input.bookingId),
        reason: typeof input.reason === "string" ? input.reason : undefined,
      });

      if (!result.success) {
        return {
          success: false,
          errors: result.errors ?? [],
          message: result.message ?? "Booking could not be cancelled.",
        };
      }

      return {
        success: true,
        bookingId: result.bookingId,
        cancelledAt: result.cancelledAt,
        status: result.status,
      };
    },
  };
}

function createCheckInBookingTool(ports: SchedulingToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: {
            bookingId: { type: "string" },
            roomId: { type: "string" },
          },
          required: ["bookingId"],
        },
        input,
      );
    },
    async execute(context, input) {
      const userId = requireUser(context);
      const result = await ports.checkInBooking({
        companyId: context.companyId,
        userId,
        bookingId: String(input.bookingId),
        roomId: typeof input.roomId === "string" ? input.roomId : undefined,
      });

      if (!result.success) {
        return {
          success: false,
          errors: result.errors ?? [],
          message: result.message ?? "Booking could not be checked in.",
        };
      }

      return {
        success: true,
        bookingId: result.bookingId,
        checkedInAt: result.checkedInAt,
        status: result.status,
      };
    },
  };
}

function createCheckOutBookingTool(ports: SchedulingToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: {
            bookingId: { type: "string" },
          },
          required: ["bookingId"],
        },
        input,
      );
    },
    async execute(context, input) {
      const userId = requireUser(context);
      const result = await ports.checkOutBooking({
        companyId: context.companyId,
        userId,
        bookingId: String(input.bookingId),
      });

      if (!result.success) {
        return {
          success: false,
          errors: result.errors ?? [],
          message: result.message ?? "Booking could not be checked out.",
        };
      }

      return {
        success: true,
        bookingId: result.bookingId,
        checkedOutAt: result.checkedOutAt,
        status: result.status,
      };
    },
  };
}

export function createSchedulingAgentTools(ports: SchedulingToolPorts): Record<string, Tool> {
  return {
    search_availability: createSearchAvailabilityTool(ports),
    find_next_available: createFindNextAvailableTool(ports),
    recommend_appointment: createRecommendAppointmentTool(ports),
    create_booking: createCreateBookingTool(ports),
    search_bookings: createSearchBookingsTool(ports),
    reschedule_booking: createRescheduleBookingTool(ports),
    cancel_booking: createCancelBookingTool(ports),
    check_in: createCheckInBookingTool(ports),
    check_out: createCheckOutBookingTool(ports),
  };
}

export const SEARCH_AVAILABILITY_TOOL_KEY = "search_availability";
export const FIND_NEXT_AVAILABLE_TOOL_KEY = "find_next_available";
export const RECOMMEND_APPOINTMENT_TOOL_KEY = "recommend_appointment";
export const CREATE_BOOKING_TOOL_KEY = "create_booking";
export const SEARCH_BOOKINGS_TOOL_KEY = "search_bookings";
export const RESCHEDULE_BOOKING_TOOL_KEY = "reschedule_booking";
export const CANCEL_BOOKING_TOOL_KEY = "cancel_booking";
export const CHECK_IN_TOOL_KEY = "check_in";
export const CHECK_OUT_TOOL_KEY = "check_out";
