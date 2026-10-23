import type { RuntimeGatewayChatRequest } from "../ports/runtime-ports.js";

export type SchedulingOperationIntent =
  | "none"
  | "booking"
  | "product_demo"
  | "booking_status"
  | "reschedule"
  | "cancel"
  | "check_in_out"
  | "ticket";

const BOOKING_REFERENCE_PATTERN = /\bBK-\d+\b/i;

export function stripLiveTestMarker(text: string): string {
  let cleaned = text.trim();
  // Remove one or more leading e2e/idem tokens, then optional numeric run IDs.
  for (let i = 0; i < 4; i += 1) {
    const next = cleaned
      .replace(/^(?:e2e-(?:rt|ci|wa)-\S+\s+|idem-\S+\s+)/i, "")
      .replace(/^\d{10,}\s+/, "")
      .trim();
    if (next === cleaned) break;
    cleaned = next;
  }
  return cleaned;
}

export function extractBookingReference(text: string): string | null {
  const match = text.match(BOOKING_REFERENCE_PATTERN);
  return match?.[0]?.toUpperCase() ?? null;
}

export function latestUserTextFromMessages(
  messages: RuntimeGatewayChatRequest["messages"],
): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") {
      return stripLiveTestMarker(String(message.content ?? "").trim());
    }
  }
  return "";
}

export function isNonMutatingFollowUpMessage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 48) return false;
  return (
    /^(?:ليه|ليش|why|how come|what do you mean|مش فاهم(?:ة)?|ما\s*فهمت(?:ش)?)[!.؟?\s]*$/iu.test(trimmed) ||
    /^(?:ok|okay|thanks|thank you|شكر(?:ا|اً)?)[!.؟?\s]*$/iu.test(trimmed)
  );
}

export function customerWantsBookingStatusFromText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/(?:الغي|ألغي|الغى|الغاء|إلغاء|cancel)/i.test(trimmed)) return false;
  if (/(?:أغير|اغير|تغيير|تغير|reschedule|غير(?:ي)?\s+(?:ميعاد|موعد|الحجز))/i.test(trimmed)) {
    return false;
  }
  if (/(?:شكو[يى]|شكاو|complaint|ticket|TKT-)/i.test(trimmed)) return false;
  if (customerWantsCheckInOutFromText(trimmed)) return false;
  const hasReference = BOOKING_REFERENCE_PATTERN.test(trimmed);
  if (
    /(?:حالة|status)\s*(?:ال)?(?:حجز|موعد|booking)/i.test(trimmed) ||
    /(?:اعرف|اشوف|أعرف|أشوف|عايز(?:ة|ه)?|محتاج(?:ة)?).*(?:حالة|status).*(?:حجز|موعد|booking)/i.test(
      trimmed,
    ) ||
    (hasReference &&
      /(?:اعرف|اشوف|أعرف|أشوف|حالة|status|موعد|ميعاد|حجز|booking)/i.test(trimmed) &&
      !/(?:الغي|ألغي|cancel|أغير|اغير|reschedule)/i.test(trimmed))
  ) {
    return true;
  }
  return false;
}

export function customerWantsBookingStatusByReference(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  return customerWantsBookingStatusFromText(latestUserTextFromMessages(messages));
}

export function customerWantsRescheduleFromText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  // Ticket status/priority/comment turns must never become booking reschedule.
  if (
    /(?:شكو|تذكر|complaint|ticket|TKT-)/i.test(trimmed) &&
    !/(?:حجز|موعد|ميعاد|booking|appointment)/i.test(trimmed)
  ) {
    return false;
  }
  if (
    /(?:غيّ?ر|اغير|أغير|تغيير).{0,40}(?:حال[ةه]|أ?ولوية|اولوية|priority|status)/i.test(trimmed) &&
    !/(?:حجز|موعد|ميعاد|booking|appointment)/i.test(trimmed)
  ) {
    return false;
  }
  return /(?:أغير|اغير|تغيير|تغير|عدّل|عدل|تأجيل|تاجيل|إعادة\s*جدولة|اعادة\s*جدولة|reschedule|change\s+(?:the\s+)?(?:appointment|booking|time|slot)|غير(?:ي)?\s+(?:ميعاد|موعد|الحجز)|أغير\s+ميعاد|عايز(?:ة)?\s+(?:أغير|اغير|أأجل|ااجل|أعدل|اعدل)|غيّر(?:ي)?\s+(?:الميعاد|الموعد|الحجز))/i.test(
    trimmed,
  );
}

export function customerWantsCancelFromText(text: string): boolean {
  return /(?:الغي|ألغي|الغى|الغاء|إلغاء|الالغاء|cancel(?:\s+(?:the\s+)?(?:booking|appointment))?|عايز(?:ة)?\s*(?:الغي|ألغي|الغى))/i.test(
    text.trim(),
  );
}

export function customerWantsProductDemoFromText(text: string): boolean {
  return /book(?:\s+a)?\s+(?:product\s+)?demo|\bdemo\s+booking\b|demo\s+buchen|eine\s+demo|demo-termin|(?:احجز|أحجز|هحجز).{0,24}(?:عرض\s*تجريبي|ديمو|\bdemo\b)/iu.test(
    text.trim(),
  );
}

export function customerWantsCreateBookingFromText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || isNonMutatingFollowUpMessage(trimmed)) return false;
  if (customerWantsBookingStatusFromText(trimmed)) return false;
  if (customerWantsRescheduleFromText(trimmed)) return false;
  if (customerWantsCancelFromText(trimmed)) return false;
  if (/(?:شكو[يى]|شكاو|complaint|ticket|TKT-)/i.test(trimmed)) return false;
  return (
    /^(?:حجز|احجزلي|احجز\s*لي)[!.؟?\s]*$/iu.test(trimmed) ||
    /(?:^|\s)(?:احجز|أحجز|هحجز|احجزي|أحجزي)ز*(?:\s|$)|(?:عايز(?:ة|ه)?|محتاج(?:ة)?|أنا?\s+عايز(?:ة|ه)?)\s*(?:ان\s+)?(?:احجز|أحجز|حجز)ز*|احجز(?:ز*)?\s*لي|حجز\s*جديد|book(?:\s+me|\s+an|\s+a)?\b/iu.test(
      trimmed,
    )
  );
}

/**
 * Ticket-topic turns (blocks booking tools). Explicit open OR status/track/list/comment/change —
 * never every sentence that merely mentions شكوى.
 */
export function customerWantsCreateTicketFromText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/\bTKT-\d+/i.test(trimmed)) return true;
  if (
    /تتبع|اتتبع|حال[ةه]\s*(?:ال)?شكو|حال[ةه]\s*(?:ال)?تذكر|فين\s*(?:ال)?شكو|my tickets|ticket\s*(?:status|number)|track\s*(?:my\s*)?(?:ticket|complaint)/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  if (/(?:اعرف|أشوف|اشوف|عايز).{0,24}حال[ةه].{0,24}(?:شكو|تذكر)/i.test(trimmed)) return true;
  if (
    /(?:ضيف|أضف|اضيف|أضيف).{0,24}(?:تعليق|كومنت|comment|تحديث|شكو|تذكر)|(?:غيّ?ر|اغير|أغير).{0,24}(?:حال[ةه]|أ?ولوية)/i.test(
      trimmed,
    ) ||
    /(?:تعليق|كومنت|comment|تحديث).{0,40}(?:على|علي|\bع\b).{0,24}(?:شكو|تذكر|TKT-)/i.test(trimmed)
  ) {
    return true;
  }
  if (/^(?:شكو[يى]|شكاو(?:ى|ي)?|تذكر[ةه]?|complaint|ticket)\s*[.؟!!?]*$/iu.test(trimmed)) return true;
  return /(?:(?:عايز(?:ة|ه)?|محتاج(?:ة)?)\s*(?:ان\s*)?(?:افتح|أفتح|اعمل|أعمل|نعمل|أقدم|اقدم|أرفع|ارفع)|(?:^|\s)(?:افتح|أفتح|اعمل|أعمل|أرفع|ارفع|create|open|file)).{0,40}(?:شكو|تذكر|complaint|ticket)/i.test(
    trimmed,
  );
}

export function customerWantsCheckInOutFromText(text: string): boolean {
  return /(?:تسجيل\s*(?:حضور|انصراف)|check[_\s-]?in|check[_\s-]?out|أسجل\s*(?:حضور|انصراف)|سجل(?:ي)?\s*(?:حضور|انصراف))/i.test(
    text.trim(),
  );
}

export function resolveSchedulingOperationIntent(
  messages: RuntimeGatewayChatRequest["messages"],
): SchedulingOperationIntent {
  const latest = latestUserTextFromMessages(messages);
  if (!latest) return "none";
  if (isNonMutatingFollowUpMessage(latest)) return "none";
  if (customerWantsCreateTicketFromText(latest)) return "ticket";
  if (customerWantsBookingStatusFromText(latest)) return "booking_status";
  if (customerWantsCheckInOutFromText(latest)) return "check_in_out";
  if (customerWantsRescheduleFromText(latest)) return "reschedule";
  if (customerWantsCancelFromText(latest)) return "cancel";
  if (customerWantsProductDemoFromText(latest)) return "product_demo";
  if (customerWantsCreateBookingFromText(latest)) return "booking";
  return "none";
}

export function shouldInvalidatePriorSchedulingSeed(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  const latest = latestUserTextFromMessages(messages);
  if (isNonMutatingFollowUpMessage(latest)) return true;
  const intent = resolveSchedulingOperationIntent(messages);
  if (intent === "none" || intent === "booking" || intent === "product_demo") return false;
  return true;
}

const PRODUCT_DEMO_TOOLS = new Set([
  "list_demo_types",
  "search_demo_availability",
  "find_next_demo",
  "create_demo_booking",
  "search_customer",
  "create_customer",
  "escalate_to_human",
  "queue_handoff",
]);

const BOOKING_TOOLS = new Set([
  "search_availability",
  "find_next_available",
  "recommend_appointment",
  "create_booking",
  "create_customer",
]);

const STATUS_TOOLS = new Set(["search_bookings", "booking_search"]);

const RESCHEDULE_TOOLS = new Set(["search_bookings", "booking_search", "reschedule_booking"]);

const CANCEL_TOOLS = new Set(["search_bookings", "booking_search", "cancel_booking"]);

const CHECK_IN_OUT_TOOLS = new Set(["search_bookings", "booking_search", "check_in", "check_out"]);

const TICKET_TOOLS = new Set([
  "create_ticket",
  "search_ticket",
  "update_ticket",
  "close_ticket",
  "assign_ticket",
  "add_ticket_comment",
  "change_ticket_priority",
  "change_ticket_status",
  "ensure_customer_profile",
]);

export function schedulingIntentAllowsTool(
  intent: SchedulingOperationIntent,
  toolKey: string,
): boolean {
  switch (intent) {
    case "none":
      return true;
    case "booking":
      return BOOKING_TOOLS.has(toolKey) || toolKey === "search_customer";
    case "product_demo":
      return PRODUCT_DEMO_TOOLS.has(toolKey);
    case "booking_status":
      return STATUS_TOOLS.has(toolKey);
    case "reschedule":
      return RESCHEDULE_TOOLS.has(toolKey);
    case "cancel":
      return CANCEL_TOOLS.has(toolKey);
    case "check_in_out":
      return CHECK_IN_OUT_TOOLS.has(toolKey);
    case "ticket":
      return TICKET_TOOLS.has(toolKey);
    default:
      return true;
  }
}

export function formatBookingStatusReply(
  booking: Record<string, unknown>,
): string {
  const reference = String(booking.reference ?? booking.confirmationNumber ?? "").trim();
  const status = String(booking.status ?? "").trim().toLowerCase();
  const scheduledAt = String(booking.scheduledAt ?? booking.start_at ?? "").trim();
  const statusLabel =
    status === "cancelled" || status === "canceled"
      ? "ملغي"
      : status === "completed" || status === "checked_out"
        ? "مكتمل"
        : status === "checked_in" || status === "in_progress"
          ? "تم الحضور"
          : status === "no_show"
            ? "لم يحضر"
            : status === "rescheduled"
              ? "تمت إعادة الجدولة"
              : "مؤكد";
  const lines = [
    reference ? `حالة الحجز ${reference}:` : "حالة الحجز:",
    `الحالة: ${statusLabel}`,
  ];
  if (scheduledAt) lines.push(`الموعد: ${scheduledAt}`);
  return lines.join("\n");
}
