/**
 * Additive AI tools for sales product demos.
 * Does not change clinic create_booking / search_availability contracts.
 */
import type { ConversationState } from "@workspace/ai-conversation";
import type { Tool, ToolExecutionContext } from "./tool-contract.js";
import type { SchedulingToolPorts } from "./scheduling-agent-ports.js";
import { validateAgainstSchema } from "../utils/tool-utils.js";

export const LIST_DEMO_TYPES_TOOL_KEY = "list_demo_types";
export const SEARCH_DEMO_AVAILABILITY_TOOL_KEY = "search_demo_availability";
export const FIND_NEXT_DEMO_TOOL_KEY = "find_next_demo";
export const CREATE_DEMO_BOOKING_TOOL_KEY = "create_demo_booking";

export const SALES_DEMO_TOOL_KEYS = [
  LIST_DEMO_TYPES_TOOL_KEY,
  SEARCH_DEMO_AVAILABILITY_TOOL_KEY,
  FIND_NEXT_DEMO_TOOL_KEY,
  CREATE_DEMO_BOOKING_TOOL_KEY,
] as const;

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

function isCustomerUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

function cairoCalendarYmd(offsetDays = 0, now = new Date()): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  if (offsetDays === 0) return today;
  const [year, month, day] = today.split("-").map((part) => Number(part));
  return new Date(Date.UTC(year!, month! - 1, day! + offsetDays)).toISOString().slice(0, 10);
}

/** ISO date, or English/Arabic/German today and tomorrow in the Cairo calendar. */
export function resolveDemoCalendarDate(raw: string, now = new Date()): string | null {
  const text = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^(?:tomorrow|morgen|بكره|بكرة|غدًا|غدا|غداً)$/iu.test(text)) return cairoCalendarYmd(1, now);
  if (/^(?:today|heute|اليوم|النهاردة)$/iu.test(text)) return cairoCalendarYmd(0, now);
  return null;
}

function optionalDaysAhead(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 ? value : undefined;
}

function createListDemoTypesTool(ports: SchedulingToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(_input) {
      validateAgainstSchema({ type: "object", properties: {}, additionalProperties: false }, _input);
    },
    async execute(context) {
      const userId = requireUser(context);
      if (!ports.listDemoTypes) {
        return { success: false, demos: [], message: "Demo listing is not configured." };
      }
      return ports.listDemoTypes({ companyId: context.companyId, userId });
    },
  };
}

function createSearchDemoAvailabilityTool(ports: SchedulingToolPorts): Tool {
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
            date: { type: "string" },
            daysAhead: { type: "number" },
          },
          required: ["serviceId"],
        },
        input,
      );
    },
    async execute(context, input) {
      const userId = requireUser(context);
      if (!ports.searchDemoAvailability) {
        return { success: false, message: "Demo availability search is not configured." };
      }
      return ports.searchDemoAvailability({
        companyId: context.companyId,
        userId,
        serviceId: String(input.serviceId),
        resourceId: typeof input.resourceId === "string" ? input.resourceId : undefined,
        branchId: typeof input.branchId === "string" ? input.branchId : undefined,
        date:
          typeof input.date === "string"
            ? (resolveDemoCalendarDate(input.date) ?? input.date)
            : undefined,
        daysAhead: optionalDaysAhead(input.daysAhead),
      });
    },
  };
}

function createFindNextDemoTool(ports: SchedulingToolPorts): Tool {
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
            daysAhead: { type: "number" },
          },
          required: ["serviceId"],
        },
        input,
      );
    },
    async execute(context, input) {
      const userId = requireUser(context);
      if (!ports.findNextDemo) {
        return {
          success: false,
          slot: null,
          searchedWindow: 7,
          message: "Find next demo is not configured.",
        };
      }
      return ports.findNextDemo({
        companyId: context.companyId,
        userId,
        serviceId: String(input.serviceId),
        resourceId: typeof input.resourceId === "string" ? input.resourceId : undefined,
        branchId: typeof input.branchId === "string" ? input.branchId : undefined,
        daysAhead: optionalDaysAhead(input.daysAhead),
      });
    },
  };
}

function createCreateDemoBookingTool(ports: SchedulingToolPorts): Tool {
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
            date: { type: "string" },
            slotStart: { type: "string" },
            branchId: { type: "string" },
            notes: { type: "string" },
            clientRequestId: { type: "string" },
          },
          required: ["serviceId", "date", "slotStart"],
        },
        input,
      );
    },
    async execute(context, input) {
      const userId = requireUser(context);
      if (!ports.createDemoBooking) {
        return {
          success: false,
          errors: ["NOT_CONFIGURED"],
          message: "Demo booking is not configured.",
          customerFacingMessage: "حجز عرض المنتج غير متاح حالياً.",
        };
      }

      const requestedDate = resolveDemoCalendarDate(String(input.date ?? ""));
      const today = cairoCalendarYmd(0);
      if (!requestedDate || requestedDate < today) {
        return {
          success: false,
          errors: ["date_not_bookable"],
          message: "Demo date must be today or later as YYYY-MM-DD.",
          customerFacingMessage: "محتاج تاريخ من النهاردة أو بعده. قولي اليوم.",
          instruction: "Ask for a calendar date. Do not guess a year and do not claim a booking.",
          bookingPersisted: false,
          handoffAttempted: false,
          handoffSucceeded: false,
        };
      }

      let customerId = String(input.customerId ?? "").trim();
      const trustedCustomerId = context.trustedCustomerId?.trim() || null;
      if (trustedCustomerId && isCustomerUuid(trustedCustomerId)) {
        customerId = trustedCustomerId;
      } else if (!isCustomerUuid(customerId) && ports.resolveCustomerIdForBooking) {
        customerId =
          (await ports.resolveCustomerIdForBooking({
            companyId: context.companyId,
            userId,
            conversationId: context.conversationId,
            candidate: customerId,
          })) ?? "";
      }
      if (!isCustomerUuid(customerId)) {
        return {
          success: false,
          errors: ["invalid_customer_id"],
          message: "customerId must be a CRM customer UUID.",
          customerFacingMessage: "محتاجين بيانات العميل عشان نحجز عرض المنتج.",
        };
      }

      const result = await ports.createDemoBooking({
        companyId: context.companyId,
        userId,
        customerId,
        serviceId: String(input.serviceId),
        resourceId: typeof input.resourceId === "string" ? input.resourceId : undefined,
        date: requestedDate,
        slotStart: String(input.slotStart),
        branchId: typeof input.branchId === "string" ? input.branchId : undefined,
        notes: typeof input.notes === "string" ? input.notes : undefined,
        clientRequestId:
          typeof input.clientRequestId === "string" ? input.clientRequestId : undefined,
        conversationId: context.conversationId,
        source: "ai_assistant",
      });

      if (!result.success || !result.bookingId) {
        return {
          success: false,
          errors: result.errors ?? [],
          message: result.message ?? "Demo booking could not be created.",
          customerFacingMessage:
            result.customerFacingMessage ??
            (result.errors?.includes("service_kind_mismatch")
              ? "الخدمة دي مش عرض منتج. استخدم أدوات حجز العيادات للخدمات العادية."
              : "ما قدرناش نحجز عرض المنتج. جرّب معاد تاني."),
          instruction:
            "Tell the customer the demo booking failed. Do not claim success. Do not use clinic create_booking for sales demos. Do not retry with a new booking id.",
          bookingPersisted: false,
          handoffAttempted: false,
          handoffSucceeded: false,
        };
      }

      let handoffSucceeded = false;
      let handoffOwnerType: string | null = null;
      let handoffAttempted = false;
      let handoffError: string | null = null;
      if (ports.handoffAfterDemoBooking && context.conversationId) {
        handoffAttempted = true;
        try {
          const handed = await ports.handoffAfterDemoBooking({
            companyId: context.companyId,
            conversationId: context.conversationId,
            bookingId: result.bookingId,
            reason: `Product demo booked (${result.confirmationNumber ?? result.bookingId}). A human representative continues the demo.`,
          });
          handoffSucceeded = handed.succeeded === true;
          handoffOwnerType = handed.ownerType;
        } catch (error) {
          handoffError = error instanceof Error ? error.message : "handoff_failed";
        }
      }

      const confirmation = result.confirmationNumber ?? result.bookingId;
      return {
        success: true,
        bookingId: result.bookingId,
        confirmationNumber: result.confirmationNumber,
        status: result.status,
        startAt: result.startAt,
        endAt: result.endAt,
        resourceId: result.resourceId,
        bookingPersisted: true,
        handoffAttempted,
        handoffSucceeded,
        handoffOwnerType,
        ...(handoffError ? { handoffError } : {}),
        customerFacingMessage: handoffSucceeded
          ? `تم حجز عرض المنتج. رقم الحجز: ${confirmation}. زميل من الفريق هيكمل معاك العرض.`
          : `تم حجز عرض المنتج. رقم الحجز: ${confirmation}. لسه مش متأكد إن حد من الفريق استلم المحادثة.`,
        instruction: handoffSucceeded
          ? "Confirm the booking number and say a human representative will continue. Stop autonomous sales."
          : "Confirm the booking number only. Say handoff to a human could not be confirmed. Do not book again.",
      };
    },
  };
}

export function createSalesDemoSchedulingTools(ports: SchedulingToolPorts): Record<string, Tool> {
  return {
    [LIST_DEMO_TYPES_TOOL_KEY]: createListDemoTypesTool(ports),
    [SEARCH_DEMO_AVAILABILITY_TOOL_KEY]: createSearchDemoAvailabilityTool(ports),
    [FIND_NEXT_DEMO_TOOL_KEY]: createFindNextDemoTool(ports),
    [CREATE_DEMO_BOOKING_TOOL_KEY]: createCreateDemoBookingTool(ports),
  };
}
