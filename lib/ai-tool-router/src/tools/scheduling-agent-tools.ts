import type { ConversationState } from "@workspace/ai-conversation";
import type { Tool, ToolExecutionContext } from "./tool-contract.js";
import type { SchedulingToolPorts } from "./scheduling-agent-ports.js";
import { validateAgainstSchema } from "../utils/tool-utils.js";
import {
  buildBookingConfirmationMessageAr,
  formatArabicTime12h,
  formatArabicWeekdayDate,
} from "../utils/scheduling-customer-display.js";
import { createSalesDemoSchedulingTools } from "./sales-demo-scheduling-tools.js";
export {
  LIST_DEMO_TYPES_TOOL_KEY,
  SEARCH_DEMO_AVAILABILITY_TOOL_KEY,
  FIND_NEXT_DEMO_TOOL_KEY,
  CREATE_DEMO_BOOKING_TOOL_KEY,
  SALES_DEMO_TOOL_KEYS,
} from "./sales-demo-scheduling-tools.js";

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

/** Drop daysAhead < 1 so LLM `0` with a concrete date does not fail the engine. */
function optionalDaysAhead(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 ? value : undefined;
}

function formatBookingDateForCustomer(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!match) return date.trim();
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function formatBookingTimeForCustomer(slotStart: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(slotStart.trim());
  if (!match) return slotStart.trim();
  return `${match[1]!.padStart(2, "0")}:${match[2]}`;
}

function formatBookingReference(confirmationNumber: string | null | undefined, bookingId: string): string {
  const confirmation = typeof confirmationNumber === "string" ? confirmationNumber.trim() : "";
  if (confirmation) return confirmation;
  throw new Error(
    `Missing authoritative confirmation_number for booking ${bookingId.trim() || "(unknown)"}.`,
  );
}

function buildBookingConfirmationMessage(input: {
  bookingId: string;
  confirmationNumber: string;
  date: string;
  slotStart: string;
  customerName?: string | null;
  serviceName?: string | null;
}): string {
  return buildBookingConfirmationMessageAr(input);
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
        // Phase 5Q.2: LLMs often pass daysAhead=0 with a concrete date; that fails validation
        // and forces a second LLM+tool round (~10–20s). Treat <1 as omitted (engine default).
        daysAhead: optionalDaysAhead(input.daysAhead),
      });

      return {
        success: result.success,
        serviceId: result.serviceId,
        durationMinutes: result.durationMinutes,
        availableDates: result.availableDates,
        resources: result.resources,
        message: result.message ?? null,
        customerSummary: result.customerSummary ?? null,
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
        daysAhead: optionalDaysAhead(input.daysAhead),
      });

      const slot = result.slot;
      const customerFacingMessage =
        result.success && slot
          ? `أقرب موعد متاح: ${formatArabicWeekdayDate(slot.date)} الساعة ${formatArabicTime12h(slot.start)}${
              slot.resourceName ? ` مع ${slot.resourceName}` : ""
            }.`
          : typeof result.message === "string" && result.message.trim()
            ? result.message.trim()
            : "ما فيش موعد متاح قريب دلوقتي.";

      return {
        success: result.success,
        searchedWindow: result.searchedWindow,
        nextSuggestion: result.nextSuggestion ?? null,
        message: result.message ?? null,
        slot: result.slot,
        customerFacingMessage,
        instruction:
          "Reply to the customer using customerFacingMessage exactly. Do not invent a different date or time.",
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
        daysAhead: optionalDaysAhead(input.daysAhead),
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

function isCustomerUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
            visitType: { type: "string", description: "Priced visit type code such as New or Consultation" },
          },
          required: ["customerId", "serviceId", "resourceId", "date", "slotStart"],
        },
        input,
      );
    },
    async execute(context, input) {
      const userId = requireUser(context);
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
          message: "customerId must be a CRM customer UUID from search_customer or create_customer.",
          customerFacingMessage: "محتاجين اسم العميل ورقم موبايل العميل عشان نكمّل الحجز.",
          instruction:
            "Do not invent customerId and do not pass the customer name or phone as customerId. Ask once for customer name and mobile if missing, then search_customer by WhatsApp phone (CHANNEL SENDER) or create_customer with name+phone, then retry create_booking with that UUID. Do not claim the booking succeeded.",
        };
      }
      const result = await ports.createBooking({
        companyId: context.companyId,
        userId,
        customerId,
        serviceId: String(input.serviceId),
        resourceId: String(input.resourceId),
        date: String(input.date),
        slotStart: String(input.slotStart),
        branchId: typeof input.branchId === "string" ? input.branchId : undefined,
        notes: typeof input.notes === "string" ? input.notes : undefined,
        visitType: typeof input.visitType === "string" ? input.visitType : undefined,
        conversationId: context.conversationId,
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

      const date = String(input.date);
      const slotStart = String(input.slotStart);
      const bookingId = String(result.bookingId ?? "");
      const confirmationNumber = formatBookingReference(result.confirmationNumber, bookingId);
      const resolvedCustomerName =
        typeof result.customerName === "string"
          ? result.customerName
          : typeof input.customerName === "string"
            ? input.customerName
            : null;
      const customerFacingMessage = buildBookingConfirmationMessage({
        bookingId,
        confirmationNumber,
        date,
        slotStart,
        customerName: resolvedCustomerName,
        serviceName: typeof result.serviceName === "string" ? result.serviceName : null,
      });

      return {
        success: true,
        bookingId,
        bookingRef: confirmationNumber,
        confirmationNumber,
        status: result.status,
        startAt: result.startAt,
        endAt: result.endAt,
        date,
        slotStart,
        customerFacingMessage,
        instruction:
          "Reply to the customer using customerFacingMessage exactly. Do not invent a different date, time, or booking number.",
      };
    },
  };
}

function formatBookingWhenForCustomer(iso: string): string | null {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date(parsed));
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    const day = get("day");
    const month = get("month");
    const year = get("year");
    const hour = get("hour");
    const minute = get("minute");
    if (!day || !month || !year || !hour || !minute) return null;
    return `${day}-${month}-${year} الساعة ${hour}:${minute}`;
  } catch {
    return null;
  }
}

function bookingStatusLabelAr(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (normalized === "cancelled" || normalized === "canceled") return "ملغي";
  if (normalized === "completed" || normalized === "checked_out") return "مكتمل";
  if (normalized === "checked_in" || normalized === "in_progress") return "تم الحضور";
  if (normalized === "no_show") return "لم يحضر";
  return "مؤكد";
}

function isCancellableBookingStatus(status: string | undefined): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (!normalized) return true;
  return !(
    normalized === "cancelled" ||
    normalized === "canceled" ||
    normalized === "completed" ||
    normalized === "checked_out" ||
    normalized === "checked_in" ||
    normalized === "with_nurse" ||
    normalized === "in_progress" ||
    normalized === "no_show" ||
    normalized === "rescheduled" ||
    normalized === "expired"
  );
}

/** Customers see at most this many upcoming and this many past bookings per reply. */
const CUSTOMER_BOOKING_LIST_LIMIT = 3;

function bookingStartMs(booking: { scheduledAt?: string }): number {
  const startMs = booking.scheduledAt ? Date.parse(booking.scheduledAt) : Number.NaN;
  return Number.isFinite(startMs) ? startMs : Number.NaN;
}

function isUpcomingActiveBooking(booking: { scheduledAt?: string; status?: string }, nowMs: number): boolean {
  const status = String(booking.status ?? "").trim().toLowerCase();
  if (status && status !== "pending" && status !== "confirmed") return false;
  return bookingStartMs(booking) > nowMs;
}

function byStartAscending(a: { scheduledAt?: string }, b: { scheduledAt?: string }): number {
  return (bookingStartMs(a) || 0) - (bookingStartMs(b) || 0);
}

export type SearchBookingsWhen = "upcoming" | "past" | "all";

export function buildSearchBookingsCustomerMessage(
  bookings: Array<{
    reference?: string;
    scheduledAt?: string;
    status?: string;
    employeeName?: string;
    serviceName?: string;
    customerName?: string;
  }>,
  phone?: string,
  purpose: "list" | "cancel" = "list",
  referenceNow: Date = new Date(),
  when: SearchBookingsWhen = "upcoming",
): string {
  const nowMs = referenceNow.getTime();
  const visible =
    purpose === "cancel"
      ? bookings.filter((booking) => {
          if (!isCancellableBookingStatus(booking.status)) return false;
          // Past appointments always fail cancellation_window_expired — don't offer them.
          if (!booking.scheduledAt) return false;
          const startMs = Date.parse(booking.scheduledAt);
          return Number.isFinite(startMs) && startMs > nowMs;
        })
      : bookings;

  if (visible.length === 0) {
    if (purpose === "cancel") {
      return phone
        ? `مفيش مواعيد قابلة للإلغاء على الرقم ${phone} حالياً.`
        : "مفيش مواعيد قابلة للإلغاء على الرقم ده حالياً.";
    }
    return phone
      ? `مفيش حجوزات مسجّلة على الرقم ${phone} في الفترة دي.`
      : "مفيش حجوزات مسجّلة على الرقم ده في الفترة دي.";
  }

  const bookingLine = (booking: (typeof visible)[number], number: number): string => {
    const when = booking.scheduledAt ? formatBookingWhenForCustomer(booking.scheduledAt) : null;
    const parts = [
      booking.reference ? `رقم الحجز: ${booking.reference}` : null,
      when ? `الموعد: ${when}` : null,
      booking.serviceName ? `الخدمة: ${booking.serviceName}` : null,
      booking.employeeName ? `مع: ${booking.employeeName}` : null,
      booking.status ? `الحالة: ${bookingStatusLabelAr(String(booking.status))}` : null,
    ].filter(Boolean);
    return `${number}) ${parts.join(" | ")}`;
  };

  if (purpose === "list") {
    const upcoming = visible.filter((booking) => isUpcomingActiveBooking(booking, nowMs)).sort(byStartAscending);
    const past = visible
      .filter((booking) => !upcoming.includes(booking))
      .sort((a, b) => byStartAscending(b, a));
    const lines: string[] = [];
    let number = 0;
    if (when !== "past") {
      if (upcoming.length > 0) {
        lines.push("حجوزاتك الجاية:");
        for (const booking of upcoming.slice(0, CUSTOMER_BOOKING_LIST_LIMIT)) lines.push(bookingLine(booking, ++number));
        if (upcoming.length > CUSTOMER_BOOKING_LIST_LIMIT) {
          lines.push(`وعندك كمان ${upcoming.length - CUSTOMER_BOOKING_LIST_LIMIT} حجز جاي.`);
        }
      } else {
        lines.push("مفيش عندك حجوزات جاية.");
      }
    }
    if (when !== "upcoming") {
      if (past.length > 0) {
        lines.push("آخر حجوزاتك اللي فاتت:");
        for (const booking of past.slice(0, CUSTOMER_BOOKING_LIST_LIMIT)) lines.push(bookingLine(booking, ++number));
      } else {
        lines.push("مفيش عندك حجوزات سابقة.");
      }
    } else if (past.length > 0) {
      lines.push("لو عايز تشوف حجوزاتك اللي فاتت قولّي «حجوزاتي اللي فاتت».");
    }
    return lines.join("\n");
  }

  // Numbering must match the order search_bookings returns, so list selections resolve correctly.
  const shown = [...visible].sort(byStartAscending).slice(0, CUSTOMER_BOOKING_LIST_LIMIT);
  const lines = [`لقيت ${visible.length} موعد ممكن إلغاؤه:`];
  for (const [index, booking] of shown.entries()) lines.push(bookingLine(booking, index + 1));
  if (visible.length > shown.length) {
    lines.push(`ومعاهم ${visible.length - shown.length} حجز تاني، ابعت رقم الحجز (BK-…) لو عايز تلغي واحد منهم.`);
  }

  if (visible.length === 1) {
    const only = visible[0];
    const ref = only?.reference ? ` (${only.reference})` : "";
    lines.push(`ده الموعد الوحيد. قولّي "ألغي" أو ابعتي رقم الحجز${ref} عشان نكمّل الإلغاء.`);
  } else {
    lines.push(
      'قولّي أنهي موعد تلغي؟ ابعتي رقم القائمة (مثلاً 1 أو 2) أو رقم الحجز (مثل BK-000028). مش هألغي غير بعد ما تختاري.',
    );
  }

  return lines.join("\n");
}

export function createSearchBookingsTool(ports: SchedulingToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: {
            customerId: { type: "string" },
            phone: { type: "string", description: "Patient mobile number to look up bookings for" },
            daysBack: { type: "number", description: "Days of history to include (default 30)" },
            purpose: {
              type: "string",
              description: 'Use "cancel" when the customer wants to cancel an appointment; otherwise "list".',
            },
            when: {
              type: "string",
              description:
                'Which bookings to show for "list": "upcoming" (default), "past" only when the customer explicitly asks for previous bookings, "all" only when they ask for both.',
            },
          },
        },
        input,
      );
    },
    async execute(context, input) {
      const userId = requireUser(context);
      const phone =
        typeof input.phone === "string" && input.phone.trim() ? input.phone.trim() : undefined;
      const purposeRaw = typeof input.purpose === "string" ? input.purpose.trim().toLowerCase() : "";
      const purpose: "list" | "cancel" = purposeRaw === "cancel" ? "cancel" : "list";
      // Never trust LLM customerId for scoping — conversation customer only (unless phone lookup).
      const trustedCustomerId = context.trustedCustomerId?.trim() || null;
      const result = await ports.searchBookings({
        companyId: context.companyId,
        userId,
        trustedCustomerId,
        phone,
        daysBack: typeof input.daysBack === "number" ? input.daysBack : phone ? 90 : undefined,
        conversationId: context.conversationId,
      });

      const bookings = Array.isArray(result.bookings) ? result.bookings : [];
      const nowMs = Date.now();
      const visibleBookings =
        purpose === "cancel"
          ? bookings.filter((booking) => {
              const status = typeof booking.status === "string" ? booking.status : "";
              if (!isCancellableBookingStatus(status)) return false;
              const scheduledAt =
                typeof booking.scheduledAt === "string" ? booking.scheduledAt : "";
              if (!scheduledAt) return false;
              const startMs = Date.parse(scheduledAt);
              return Number.isFinite(startMs) && startMs > nowMs;
            }).sort(byStartAscending)
          : bookings;
      const whenRaw = typeof input.when === "string" ? input.when.trim().toLowerCase() : "";
      const when: SearchBookingsWhen = whenRaw === "past" || whenRaw === "all" ? whenRaw : "upcoming";
      const identityMismatch = Array.isArray(result.errors)
        && result.errors.includes("IDENTITY_PHONE_MISMATCH");
      const customerFacingMessage = identityMismatch
        ? "الرقم اللي بعتّه مش مطابق لرقم المحادثة الموثّق. وضّح لو حابب نكمل برقم الشات ده، أو ابعت بيانات التحقق من لوحة التحكم — مش هعرض حجوزات بناءً على رقم مختلف."
        : result.success
          ? buildSearchBookingsCustomerMessage(visibleBookings, phone, purpose, new Date(nowMs), when)
          : result.message ?? "ما قدرناش نجيب الحجوزات دلوقتي.";

      return {
        success: result.success,
        bookings: identityMismatch ? [] : visibleBookings,
        total: identityMismatch ? 0 : purpose === "cancel" ? visibleBookings.length : result.total,
        purpose,
        message: result.message ?? null,
        errors: result.errors ?? null,
        customerFacingMessage,
        instruction:
          purpose === "cancel"
            ? "Reply using customerFacingMessage exactly. Ask which appointment to cancel. Do NOT call cancel_booking until the customer picks one booking (list number or BK- reference)."
            : "Reply to the customer using customerFacingMessage exactly. Do not invent bookings or stay silent.",
      };
    },
  };
}

export function createRescheduleBookingTool(ports: SchedulingToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: {
            bookingId: { type: "string" },
            bookingReference: {
              type: "string",
              description: "Customer-facing booking number like BK-000025",
            },
            date: { type: "string", description: "YYYY-MM-DD" },
            slotStart: { type: "string", description: "HH:mm local wall time" },
            reason: { type: "string" },
            phone: {
              type: "string",
              description: "Patient mobile used to authorize reschedule when needed",
            },
          },
          required: ["date", "slotStart"],
        },
        input,
      );
      const bookingId = typeof input.bookingId === "string" ? input.bookingId.trim() : "";
      const bookingReference =
        typeof input.bookingReference === "string" ? input.bookingReference.trim() : "";
      if (!bookingId && !bookingReference) {
        throw new Error("bookingId or bookingReference is required.");
      }
    },
    async execute(context, input) {
      const userId = requireUser(context);
      const trustedCustomerId = context.trustedCustomerId?.trim() || null;
      const phone = typeof input.phone === "string" ? input.phone.trim() : "";
      if (!trustedCustomerId && !phone) {
        return {
          success: false,
          errors: ["CUSTOMER_CONTEXT_REQUIRED"],
          message:
            "Trusted customer context or patient phone is required before rescheduling a booking.",
          customerFacingMessage:
            "محتاجين رقم موبايل المريض عشان نأكد ملكية الحجز قبل تغيير الميعاد.",
        };
      }
      const result = await ports.rescheduleBooking({
        companyId: context.companyId,
        userId,
        bookingId: typeof input.bookingId === "string" ? input.bookingId : undefined,
        bookingReference:
          typeof input.bookingReference === "string" ? input.bookingReference : undefined,
        date: String(input.date),
        slotStart: String(input.slotStart),
        reason: typeof input.reason === "string" ? input.reason : undefined,
        trustedCustomerId,
        phone: phone || null,
        conversationId: context.conversationId,
      });

      if (!result.success) {
        return {
          success: false,
          errors: result.errors ?? [],
          message: result.message ?? "Booking could not be rescheduled.",
          customerFacingMessage: result.customerFacingMessage,
        };
      }

      return {
        success: true,
        bookingId: result.bookingId,
        reference: result.reference,
        scheduledAt: result.scheduledAt,
        rescheduledAt: result.rescheduledAt,
        customerFacingMessage: result.customerFacingMessage,
      };
    },
  };
}

export function createCancelBookingTool(ports: SchedulingToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: {
            bookingId: { type: "string" },
            bookingReference: { type: "string", description: "Customer-facing booking number like BK-000025" },
            reason: { type: "string" },
            phone: { type: "string", description: "Patient mobile used to authorize cancel when needed" },
            conversationScopedCancel: { type: "boolean" },
          },
        },
        input,
      );
      const bookingId = typeof input.bookingId === "string" ? input.bookingId.trim() : "";
      const bookingReference =
        typeof input.bookingReference === "string" ? input.bookingReference.trim() : "";
      if (!bookingId && !bookingReference) {
        throw new Error("bookingId or bookingReference is required.");
      }
    },
    async execute(context, input) {
      const userId = requireUser(context);
      const trustedCustomerId = context.trustedCustomerId?.trim() || null;
      const phone =
        typeof input.phone === "string" && input.phone.trim() ? input.phone.trim() : undefined;
      const bookingId = typeof input.bookingId === "string" ? input.bookingId.trim() : "";
      const bookingReference =
        typeof input.bookingReference === "string" ? input.bookingReference.trim() : "";
      const conversationScopedCancel = input.conversationScopedCancel === true;

      if (!trustedCustomerId && !phone && !conversationScopedCancel) {
        return {
          success: false,
          errors: ["CUSTOMER_CONTEXT_REQUIRED"],
          message: "Trusted customer context or patient phone is required before cancelling a booking.",
          customerFacingMessage: "محتاجين رقم الموبايل المسجّل على الحجز عشان نقدر نلغي.",
        };
      }

      const result = await ports.cancelBooking({
        companyId: context.companyId,
        userId,
        bookingId: bookingId || undefined,
        bookingReference: bookingReference || undefined,
        reason: typeof input.reason === "string" ? input.reason : undefined,
        trustedCustomerId,
        phone,
        conversationScopedCancel,
        conversationId: context.conversationId,
      });

      if (!result.success) {
        return {
          success: false,
          errors: result.errors ?? [],
          message: result.message ?? "Booking could not be cancelled.",
          customerFacingMessage:
            result.customerFacingMessage ??
            "ما قدرناش نلغي الحجز ده. تأكدي من رقم الحجز أو ابعتي رقم الموبايل تاني.",
        };
      }

      return {
        success: true,
        bookingId: result.bookingId,
        cancelledAt: result.cancelledAt,
        status: result.status,
        reference: result.reference ?? null,
        customerFacingMessage: result.customerFacingMessage ?? "تم إلغاء الحجز بنجاح.",
        instruction: "Reply using customerFacingMessage exactly. Do not restart booking or show the full list again.",
      };
    },
  };
}

export function createCheckInBookingTool(ports: SchedulingToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: {
            bookingId: { type: "string" },
            bookingReference: { type: "string" },
            phone: { type: "string" },
            roomId: { type: "string" },
          },
          additionalProperties: false,
        },
        input,
      );
      const bookingId = typeof input.bookingId === "string" ? input.bookingId.trim() : "";
      const bookingReference =
        typeof input.bookingReference === "string" ? input.bookingReference.trim() : "";
      if (!bookingId && !bookingReference) {
        throw new Error("bookingId or bookingReference is required");
      }
    },
    async execute(context, input) {
      const userId = requireUser(context);
      let trustedCustomerId = context.trustedCustomerId?.trim() || null;
      const phone = typeof input.phone === "string" ? input.phone.trim() : "";
      const bookingId = typeof input.bookingId === "string" ? input.bookingId.trim() : "";
      const bookingReference =
        typeof input.bookingReference === "string" ? input.bookingReference.trim() : "";

      // Phone lookup links conversation customer so ownership can succeed on chat UI.
      if (!trustedCustomerId && phone && ports.searchBookings) {
        await ports.searchBookings({
          companyId: context.companyId,
          userId,
          phone,
          daysBack: 90,
          conversationId: context.conversationId,
        });
      }

      if (!trustedCustomerId && !phone) {
        return {
          success: false,
          errors: ["CUSTOMER_CONTEXT_REQUIRED"],
          message: "Trusted customer context is required before checking in a booking.",
          customerFacingMessage: "محتاجين رقم الموبايل المسجّل على الحجز عشان نسجّل الحضور.",
        };
      }

      const result = await ports.checkInBooking({
        companyId: context.companyId,
        userId,
        bookingId: bookingId || undefined,
        bookingReference: bookingReference || undefined,
        phone: phone || undefined,
        roomId: typeof input.roomId === "string" ? input.roomId : undefined,
        trustedCustomerId,
        conversationId: context.conversationId,
      });

      if (!result.success) {
        return {
          success: false,
          errors: result.errors ?? [],
          message: result.message ?? "Booking could not be checked in.",
          customerFacingMessage:
            result.customerFacingMessage ??
            (result.errors?.includes("CUSTOMER_CONTEXT_REQUIRED")
              ? "محتاجين رقم الموبايل المسجّل على الحجز عشان نسجّل الحضور."
              : result.message),
        };
      }

      return {
        success: true,
        bookingId: result.bookingId,
        confirmationNumber: formatBookingReference(
          result.confirmationNumber,
          result.bookingId ?? bookingId,
        ),
        checkedInAt: result.checkedInAt,
        status: result.status,
        customerFacingMessage: `تم تسجيل الحضور للحجز ${formatBookingReference(
          result.confirmationNumber,
          result.bookingId ?? bookingId,
        )} بنجاح.`,
      };
    },
  };
}

export function createCheckOutBookingTool(ports: SchedulingToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: {
            bookingId: { type: "string" },
            bookingReference: { type: "string" },
            phone: { type: "string" },
          },
          additionalProperties: false,
        },
        input,
      );
      const bookingId = typeof input.bookingId === "string" ? input.bookingId.trim() : "";
      const bookingReference =
        typeof input.bookingReference === "string" ? input.bookingReference.trim() : "";
      if (!bookingId && !bookingReference) {
        throw new Error("bookingId or bookingReference is required");
      }
    },
    async execute(context, input) {
      const userId = requireUser(context);
      const trustedCustomerId = context.trustedCustomerId?.trim() || null;
      const phone = typeof input.phone === "string" ? input.phone.trim() : "";
      const bookingId = typeof input.bookingId === "string" ? input.bookingId.trim() : "";
      const bookingReference =
        typeof input.bookingReference === "string" ? input.bookingReference.trim() : "";

      if (!trustedCustomerId && !phone) {
        return {
          success: false,
          errors: ["CUSTOMER_CONTEXT_REQUIRED"],
          message: "Trusted customer context is required before checking out a booking.",
          customerFacingMessage: "محتاجين رقم الموبايل المسجّل على الحجز عشان نسجّل الانصراف.",
        };
      }
      const result = await ports.checkOutBooking({
        companyId: context.companyId,
        userId,
        bookingId: bookingId || undefined,
        bookingReference: bookingReference || undefined,
        phone: phone || undefined,
        trustedCustomerId,
        conversationId: context.conversationId,
      });

      if (!result.success) {
        return {
          success: false,
          errors: result.errors ?? [],
          message: result.message ?? "Booking could not be checked out.",
          customerFacingMessage:
            result.customerFacingMessage ??
            (result.errors?.includes("CUSTOMER_CONTEXT_REQUIRED")
              ? "محتاجين رقم الموبايل المسجّل على الحجز عشان نسجّل الانصراف."
              : result.message),
        };
      }

      return {
        success: true,
        bookingId: result.bookingId,
        confirmationNumber: formatBookingReference(
          result.confirmationNumber,
          result.bookingId ?? bookingId,
        ),
        checkedOutAt: result.checkedOutAt,
        status: result.status,
        customerFacingMessage: `تم تسجيل الانصراف للحجز ${formatBookingReference(
          result.confirmationNumber,
          result.bookingId ?? bookingId,
        )} بنجاح.`,
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
    ...createSalesDemoSchedulingTools(ports),
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
