import type { ChatToolCall } from "@workspace/ai-provider-layer";
import {
  convertArabicDigitsToAscii,
  extractPhoneFromCustomerText,
  INCOMPLETE_EGYPT_MOBILE_MESSAGE_AR,
  looksLikeCalendarDateDigits,
  normalizeEgyptMobilePhone,
  validateEgyptMobilePhone,
} from "@workspace/ai-tool-router";
import { normalizeUpdateTicketInput } from "@workspace/ai-tool-router";
import type { RuntimeGatewayPort, RuntimeGatewayChatRequest, RuntimeGatewayChatResponse } from "../ports/runtime-ports.js";
import type { RuntimeToolPort } from "../ports/runtime-ports.js";
import type { ServiceContext } from "../types.js";
import {
  createToolExecutionFailurePayload,
  createToolNotAllowedDenial,
  serializeRuntimeToolDenial,
} from "./runtime-tool-denial-factory.js";
import {
  customerWantsBookingStatusByReference,
  customerWantsBookingStatusFromText,
  formatBookingStatusReply,
  isNonMutatingFollowUpMessage,
  resolveSchedulingOperationIntent,
  schedulingIntentAllowsTool,
  shouldInvalidatePriorSchedulingSeed,
} from "./scheduling-operation-intent.js";

const MAX_TOOL_ITERATIONS = 4;

function readSearchAvailabilitySummary(output: Record<string, unknown> | null): string | null {
  if (!output) return null;

  const customerSummary = output.customerSummary;
  if (typeof customerSummary === "string" && customerSummary.trim()) {
    return customerSummary.trim();
  }

  const message = output.message;
  if (typeof message === "string" && message.includes("المواعيد المتاحة")) {
    return message.trim();
  }

  if (!availabilityOutputHasSlots(output)) return null;

  const resources = output.resources;
  if (!Array.isArray(resources) || resources.length === 0) return null;
  const first = resources[0] as { resourceName?: unknown; slots?: unknown };
  const slots = Array.isArray(first.slots) ? first.slots : [];
  const timesByDate = new Map<string, string[]>();
  for (const slot of slots) {
    if (!slot || typeof slot !== "object") continue;
    const date = (slot as { date?: unknown }).date;
    const start = (slot as { start?: unknown }).start;
    if (typeof date !== "string" || typeof start !== "string") continue;
    const times = timesByDate.get(date) ?? [];
    if (!times.includes(start)) times.push(start);
    timesByDate.set(date, times);
  }
  if (timesByDate.size === 0) return null;
  const resourceName = typeof first.resourceName === "string" ? first.resourceName : "الطبيب";
  const lines = [...timesByDate.entries()].map(([date, times]) => `- ${date}: ${times.slice(0, 6).join(", ")}`);
  return [`المواعيد المتاحة مع ${resourceName}:`, ...lines].join("\n");
}

function availabilityOutputHasSlots(output: Record<string, unknown>): boolean {
  if (output.success === true) return true;
  const resources = output.resources;
  if (!Array.isArray(resources)) return false;
  return resources.some((resource) => {
    if (!resource || typeof resource !== "object") return false;
    const slots = (resource as { slots?: unknown }).slots;
    return Array.isArray(slots) && slots.length > 0;
  });
}

function countIsoAvailabilityDates(text: string): number {
  return new Set(text.match(/\d{4}-\d{2}-\d{2}/g) ?? []).size;
}

function isAvailabilityPlaceholderReply(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  if (/(?:تحقق|هبحث|سأبحث|هقوم بالبحث|هقوم بالتحقق|لحظة|يرجى الانتظار|اصبري|استني)/i.test(normalized)) {
    return true;
  }
  return false;
}

function responseIncludesAvailabilityDetails(text: string, summary: string): boolean {
  if (isAvailabilityPlaceholderReply(text)) return false;
  if (!/\d{2}:\d{2}/.test(text) && !/\d{4}-\d{2}-\d{2}/.test(text)) return false;
  const summaryDates = countIsoAvailabilityDates(summary);
  if (summaryDates <= 1) return true;
  return countIsoAvailabilityDates(text) >= 2;
}

function lastUsableAvailability(
  toolExecutions: ToolCallLoopResult["toolExecutions"],
): ToolCallLoopResult["toolExecutions"][number] | undefined {
  return [...toolExecutions]
    .reverse()
    .find(
      (execution) =>
        execution.toolKey === "search_availability" &&
        execution.status === "succeeded" &&
        (execution.output?.success === true ||
          availabilityOutputHasSlots(execution.output ?? {}) ||
          (typeof execution.output?.message === "string" &&
            /المواعيد\s*المتاحة|•\s*\d{1,2}:\d{2}/i.test(execution.output.message))),
    );
}

type CanonicalSchedulingSlot = {
  serviceId: string;
  resourceId: string;
  date: string;
  slotStart: string;
};

type CanonicalSchedulingSlotWithSource = CanonicalSchedulingSlot & {
  sourceExecution?: ToolCallLoopResult["toolExecutions"][number];
};

const SCHEDULING_SLOT_TOOL_KEYS = new Set([
  "find_next_available",
  "search_availability",
  "recommend_appointment",
]);

function normalizeSchedulingSlotStart(start: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(start.trim());
  if (!match) return start.trim();
  return `${match[1]!.padStart(2, "0")}:${match[2]}`;
}

function isSchedulingUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

function parseSlotFromFindNextOutput(
  output: Record<string, unknown>,
): CanonicalSchedulingSlot | null {
  if (output.success !== true) return null;
  const slot = output.slot;
  if (!slot || typeof slot !== "object") return null;
  const record = slot as Record<string, unknown>;
  const serviceId = String(record.serviceId ?? "").trim();
  const resourceId = String(record.resourceId ?? "").trim();
  const date = String(record.date ?? "").trim();
  const start = String(record.start ?? "").trim();
  if (!isSchedulingUuid(serviceId) || !isSchedulingUuid(resourceId) || !date || !start) {
    return null;
  }
  return {
    serviceId,
    resourceId,
    date,
    slotStart: normalizeSchedulingSlotStart(start),
  };
}

function parseSlotFromSearchAvailabilityOutput(
  output: Record<string, unknown>,
): CanonicalSchedulingSlot | null {
  if (!(output.success === true || availabilityOutputHasSlots(output))) return null;
  const serviceId = String(output.serviceId ?? "").trim();
  const resources = output.resources;
  if (!isSchedulingUuid(serviceId) || !Array.isArray(resources) || resources.length === 0) {
    return null;
  }
  const firstResource = resources[0] as { resourceId?: unknown; slots?: unknown };
  const resourceId = String(firstResource.resourceId ?? "").trim();
  const slots = Array.isArray(firstResource.slots) ? firstResource.slots : [];
  const firstSlot = slots[0] as { date?: unknown; start?: unknown } | undefined;
  const date = typeof firstSlot?.date === "string" ? firstSlot.date.trim() : "";
  const start = typeof firstSlot?.start === "string" ? firstSlot.start.trim() : "";
  if (!isSchedulingUuid(resourceId) || !date || !start) return null;
  return {
    serviceId,
    resourceId,
    date,
    slotStart: normalizeSchedulingSlotStart(start),
  };
}

function parseCanonicalSlotFromToolOutput(
  toolKey: string,
  output: Record<string, unknown> | null | undefined,
): CanonicalSchedulingSlot | null {
  if (!output || typeof output !== "object") return null;
  if (toolKey === "find_next_available") return parseSlotFromFindNextOutput(output);
  if (toolKey === "search_availability") return parseSlotFromSearchAvailabilityOutput(output);
  if (toolKey === "recommend_appointment") {
    const recommendation = output.recommendation;
    if (!recommendation || typeof recommendation !== "object") return null;
    const record = recommendation as Record<string, unknown>;
    const serviceId = String(record.serviceId ?? output.serviceId ?? "").trim();
    const resourceId = String(record.resourceId ?? "").trim();
    const date = String(record.date ?? "").trim();
    const start = String(record.start ?? record.slotStart ?? "").trim();
    if (!isSchedulingUuid(serviceId) || !isSchedulingUuid(resourceId) || !date || !start) {
      return null;
    }
    return {
      serviceId,
      resourceId,
      date,
      slotStart: normalizeSchedulingSlotStart(start),
    };
  }
  return null;
}

function parseSlotFromUnknownToolPayload(
  output: Record<string, unknown>,
): CanonicalSchedulingSlot | null {
  return (
    parseSlotFromFindNextOutput(output) ??
    parseSlotFromSearchAvailabilityOutput(output) ??
    parseCanonicalSlotFromToolOutput("recommend_appointment", output)
  );
}

function indexOfLastBookingAttemptStart(
  messages: RuntimeGatewayChatRequest["messages"],
): number {
  let lastStart = 0;
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message?.role !== "user") continue;
    const text = String(message.content ?? "").trim();
    // New booking-attempt starts only. Do NOT treat mid-flow confirms like "احجز لي"
    // as a fresh attempt — that would drop the prior availability offer window.
    if (/^احجز\s+لي\b/iu.test(text)) continue;
    if (
      /^(?:حجز)[!.؟?\s]*$/iu.test(text) ||
      /^(?:عايز\s*(?:ة|ه)?\s*(?:احجز|أحجز|حجز)ز*|محتاج(?:ة)?\s*(?:احجز|أحجز|حجز)ز*|أنا?\s+عايز(?:ة|ه)?\s+احجزز*|أ?حجز(?:ز*)?(?:\s+موعد)?|احجزلي|book(?:ing)?\b|احجزز*\b)/iu.test(
        text,
      )
    ) {
      lastStart = index;
    }
  }
  return lastStart;
}

function normalizeSchedulingCatalogLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ");
}

function readSchedulingCatalogLabels(
  messages: RuntimeGatewayChatRequest["messages"],
): Set<string> {
  const labels = new Set<string>();
  const catalogBlob = messages.map((message) => String(message.content ?? "")).join("\n");

  const serviceLinePattern = /-\s*([^:\n]+?)\s*:\s*serviceId=[0-9a-f-]{36}/gi;
  let match: RegExpExecArray | null = serviceLinePattern.exec(catalogBlob);
  while (match) {
    const name = match[1]?.trim();
    if (name) labels.add(normalizeSchedulingCatalogLabel(name));
    match = serviceLinePattern.exec(catalogBlob);
  }

  const resourceLinePattern = /-\s*([^:\n]+?)\s*:\s*resourceId=[0-9a-f-]{36}/gi;
  match = resourceLinePattern.exec(catalogBlob);
  while (match) {
    const name = match[1]?.trim();
    if (name) labels.add(normalizeSchedulingCatalogLabel(name));
    match = resourceLinePattern.exec(catalogBlob);
  }

  const linkPattern =
    /-\s*([^\n]+?)\s+offers\s+([^(:\n]+?)(?:\s*\(|:|\s*serviceId=)/gi;
  match = linkPattern.exec(catalogBlob);
  while (match) {
    const resourceName = match[1]?.trim();
    const serviceName = match[2]?.trim();
    if (resourceName) labels.add(normalizeSchedulingCatalogLabel(resourceName));
    if (serviceName) labels.add(normalizeSchedulingCatalogLabel(serviceName));
    match = linkPattern.exec(catalogBlob);
  }

  return labels;
}

function isSchedulingCatalogServiceName(
  value: string,
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  const normalized = normalizeSchedulingCatalogLabel(value);
  if (!normalized) return false;
  return readSchedulingCatalogLabels(messages).has(normalized);
}

function latestUserExplicitBookingLookup(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  const latest = latestUserTextFromMessages(messages).trim();
  if (!latest) return false;
  return (
    /^حجوزاتي\.?$/i.test(latest) ||
    /حجوزاتي\s*(?:ال)?قديمة/i.test(latest) ||
    /(?:عايز|محتاج|ممكن).*(?:اعرف|اشوف|أعرف|أشوف).*(?:حجوز|مواعيد)/i.test(latest) ||
    /(?:اعرف|اشوف|أعرف|أشوف)\s*حجوزاتي/i.test(latest)
  );
}

/**
 * Latest user turn is create-booking intent (not list/cancel/lookup).
 * Prevents old-booking phone prompts from hijacking "تمام احجز لي...".
 */
function latestUserWantsCreateBooking(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  const latest = latestUserTextFromMessages(messages).trim();
  if (!latest || isNonMutatingFollowUpMessage(latest)) return false;
  if (latestUserExplicitBookingLookup(messages)) return false;
  if (customerWantsRescheduleFromText(latest)) return false;
  if (
    /تسجيل\s*(?:حضور|انصراف)|check[_\s-]?in|check[_\s-]?out|أسجل\s*(?:حضور|انصراف)/i.test(
      latest,
    )
  ) {
    return false;
  }
  if (/(?:الغي|ألغي|الغى|الغاء|إلغاء|cancel)/i.test(latest)) return false;
  // Explicit create verbs / soft create nouns ("حجز", "عايز حجز", elongated احجزززز).
  if (
    /^(?:حجز|احجزلي|احجز\s*لي)[!.؟?\s]*$/iu.test(latest) ||
    /(?:^|\s)(?:احجز|أحجز|هحجز|احجزي|أحجزي)ز*(?:\s|$)|(?:عايز(?:ة|ه)?|محتاج(?:ة)?|أنا?\s+عايز(?:ة|ه)?)\s*(?:ان\s+)?(?:احجز|أحجز|حجز)ز*|احجز(?:ز*)?\s*لي|حجز\s*جديد|book(?:\s+me|\s+an|\s+a)?\b/iu.test(
      latest,
    )
  ) {
    return true;
  }
  // Slot confirmation after availability ("تمام … الساعة …") with booking cues.
  if (
    /تمام/.test(latest) &&
    /(?:ساعة|مساء|صباح|موعد|ميعاد|ad[ao]m|آدم|ادم)/i.test(latest) &&
    !/(?:اعرف|اشوف|أعرف|أشوف|حجوزاتي|القديمة)/i.test(latest)
  ) {
    return true;
  }
  return false;
}

function hasUserSelectedBookingSlot(
  messages: RuntimeGatewayChatRequest["messages"],
  toolExecutions: ToolCallLoopResult["toolExecutions"] = [],
): boolean {
  // Full canonical slot (weekday→offer or explicit+ids) OR bare explicit date/time
  // (reschedule / slot pick before catalog ids are available).
  return (
    resolveCanonicalSelectedSlot(messages, toolExecutions) !== null ||
    parseExplicitSelectedBookingSlot(messages) !== null ||
    resolveEmbeddedBookingIntentSlot(messages, toolExecutions) !== null
  );
}

function readLastSuccessfulSchedulingSlot(
  messages: RuntimeGatewayChatRequest["messages"],
  toolExecutions: ToolCallLoopResult["toolExecutions"],
): CanonicalSchedulingSlotWithSource | null {
  return resolveCanonicalSelectedSlot(messages, toolExecutions);
}

function hasCanonicalBookingSlotContext(
  messages: RuntimeGatewayChatRequest["messages"],
  toolExecutions: ToolCallLoopResult["toolExecutions"] = [],
): boolean {
  return readLastSuccessfulSchedulingSlot(messages, toolExecutions) !== null;
}

function readInvalidPhoneDuringBookingIntake(
  messages: RuntimeGatewayChatRequest["messages"],
  toolExecutions: ToolCallLoopResult["toolExecutions"],
): string | null {
  if (!hasUserSelectedBookingSlot(messages, toolExecutions)) return null;
  if (latestUserExplicitBookingLookup(messages)) return null;
  return readInvalidBookingPhoneMessage(readPatientIntakeFromConversation(messages), messages);
}

function shouldDenyBookingCustomerToolsForInvalidPhone(
  messages: RuntimeGatewayChatRequest["messages"],
  toolExecutions: ToolCallLoopResult["toolExecutions"],
): boolean {
  return Boolean(readInvalidPhoneDuringBookingIntake(messages, toolExecutions));
}

const EXPLICIT_BOOKING_LOOKUP_PHONE_REPLY =
  "تمام، لو عايز تعرف حجوزاتك السابقة، ابعتلي رقم الموبايل المسجّل على الحجز.";

const BOOKING_INTAKE_MESSAGE =
  "محتاجين اسم العميل ورقم موبايل العميل عشان نكمّل الحجز. ممكن تقوليلي الاسم ورقم الموبايل؟";

const BOOKING_INTAKE_NAME_MESSAGE =
  "محتاجين اسم العميل عشان نكمّل الحجز. ممكن تقوليلي الاسم؟";

const BOOKING_INTAKE_FULL_NAME_MESSAGE =
  "محتاجين الاسم الكامل للعميل (مش الاسم الأول فقط). ممكن تقوليلي الاسم بالكامل؟";

const BOOKING_PHONE_INTAKE_MESSAGE =
  "محتاجين رقم موبايل العميل عشان نكمّل الحجز. ممكن تبعتيه؟";

const RESCHEDULE_ASK_SLOT_MESSAGE =
  "تمام، عشان نغيّر الميعاد ابعتي اليوم والساعة الجديدة (مثل 24-08-2026 الساعة 08:00).";

const RESCHEDULE_ASK_BOOKING_REF_MESSAGE =
  "ابعتي رقم الحجز اللي عايزة تغيّري ميعاده (مثل BK-000026).";

const RESCHEDULE_ASK_PHONE_MESSAGE =
  "محتاجين رقم موبايل العميل عشان نأكد ملكية الحجز قبل تغيير الميعاد.";

function normalizePersonName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function personNamesMatch(existingName: string, requestedName: string): boolean {
  return normalizePersonName(existingName) === normalizePersonName(requestedName);
}

/**
 * Intake / identity-confirmation full name.
 * Single-token Arabic names (e.g. "عمر") are incomplete when a multi-part CRM
 * name is expected — but trustedCustomerId bypasses intake entirely.
 */
function isCompleteCustomerFullName(name: string | null | undefined): boolean {
  const normalized = normalizePersonName(String(name ?? ""));
  if (!normalized) return false;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return false;
  // Each token should carry real letters (Arabic or Latin), not digits-only.
  return tokens.every((token) => /[\u0600-\u06FFa-zA-Z]{2,}/.test(token));
}

/**
 * When CRM already returned an expected multi-part name, a shorter first-name-only
 * reply must not count as identity confirmation.
 */
function isInsufficientNameAgainstExpected(
  providedName: string | null | undefined,
  expectedName: string | null | undefined,
): boolean {
  const provided = normalizePersonName(String(providedName ?? ""));
  const expected = normalizePersonName(String(expectedName ?? ""));
  if (!provided || !expected) return false;
  if (personNamesMatch(expected, provided)) return false;
  const expectedTokens = expected.split(/\s+/).filter(Boolean);
  const providedTokens = provided.split(/\s+/).filter(Boolean);
  if (expectedTokens.length < 2) return false;
  if (providedTokens.length >= expectedTokens.length) return false;
  // "عمر" vs "عمر عبدالعزيز" / "عمر مجدي عبدالمحسن"
  return expected.startsWith(provided) || expectedTokens[0] === providedTokens[0];
}

function normalizePatientPhone(value: string): string {
  return normalizeEgyptMobilePhone(value);
}

function extractPhoneFromText(text: string): string | null {
  return extractPhoneFromCustomerText(text);
}

function readIncompletePhoneAttemptFromLatestUser(
  messages: RuntimeGatewayChatRequest["messages"],
): string | null {
  const latest = latestUserTextFromMessages(messages).trim();
  if (!latest) return null;
  const hasPhoneCue = /(?:موبايل|جوال|تليفون|رقمي|رقم(?:\s*ال)?(?:موبايل|جوال|تليفون)?|phone|mobile)/i.test(
    latest,
  );
  const digitChars = latest.replace(/\D/g, "").length;
  const phoneLikeTurn =
    hasPhoneCue ||
    /^[\d\s+\-().٠-٩۰-۹]+$/.test(latest) ||
    (digitChars >= 7 && digitChars / Math.max(latest.replace(/\s/g, "").length, 1) >= 0.45);
  if (!phoneLikeTurn) return null;

  const candidates = [
    ...(latest.match(/(?:\+?20)?0?1[0125][0-9٠-٩۰-۹]{4,12}/g) ?? []),
    ...(latest.match(/[0-9٠-٩۰-۹]{8,12}/g) ?? []),
  ];
  for (const candidate of candidates) {
    const validated = validateEgyptMobilePhone(candidate);
    if (validated.valid) return null;
  }
  for (const candidate of candidates) {
    const validated = validateEgyptMobilePhone(candidate);
    if (!validated.valid && validated.reason === "incomplete") {
      return INCOMPLETE_EGYPT_MOBILE_MESSAGE_AR;
    }
  }
  return null;
}

function readInvalidBookingPhoneMessage(
  intake: PatientIntake | null,
  messages: RuntimeGatewayChatRequest["messages"] = [],
): string | null {
  if (intake?.phone?.trim()) {
    const validation = validateEgyptMobilePhone(intake.phone);
    if (!validation.valid && validation.reason === "incomplete") {
      return INCOMPLETE_EGYPT_MOBILE_MESSAGE_AR;
    }
    if (!validation.valid && validation.reason === "invalid_prefix") {
      return "رقم الموبايل غير صحيح. من فضلك اكتب رقم موبايل مصري صحيح.";
    }
  }
  return readIncompletePhoneAttemptFromLatestUser(messages);
}

type PatientIntake = {
  name: string;
  age?: string;
  phone?: string;
};

function patientIntakeIsComplete(
  intake: PatientIntake | null,
): intake is PatientIntake & { phone: string } {
  if (!intake?.name?.trim() || !intake?.phone?.trim()) return false;
  if (!isCompleteCustomerFullName(intake.name)) return false;
  return validateEgyptMobilePhone(intake.phone).valid;
}

/** Phase 2 — conversation.customer_id / trustedCustomerId satisfies booking identity. */
function hasTrustedBookingIdentity(trustedCustomerId: string | null | undefined): boolean {
  return typeof trustedCustomerId === "string" && isCustomerUuid(trustedCustomerId.trim());
}

function bookingIdentityIsSatisfied(
  intake: PatientIntake | null,
  trustedCustomerId?: string | null,
): boolean {
  if (hasTrustedBookingIdentity(trustedCustomerId)) return true;
  return patientIntakeIsComplete(intake);
}

function ticketCustomerIntakeIsComplete(
  intake: PatientIntake | null,
): intake is PatientIntake & { phone: string } {
  return Boolean(intake?.name?.trim() && intake?.phone?.trim());
}

const BOOKING_INTAKE_TOOL_DENIAL =
  "Collect customer name and mobile from the customer first. Ask for both before create_customer or create_booking.";

function requiresBookingIntakeBeforeCustomerTools(
  sourceMessages: RuntimeGatewayChatRequest["messages"],
  toolExecutions: ToolCallLoopResult["toolExecutions"] = [],
  trustedCustomerId?: string | null,
): boolean {
  if (hasTrustedBookingIdentity(trustedCustomerId)) return false;
  if (customerWantsCreateTicket(sourceMessages) || customerWantsAnyTicketFlow(sourceMessages)) {
    return false;
  }
  if (latestUserExplicitBookingLookup(sourceMessages)) return false;
  return (
    hasUserSelectedBookingSlot(sourceMessages, toolExecutions) &&
    !patientIntakeIsComplete(readPatientIntakeFromConversation(sourceMessages))
  );
}

function requiresBookingIntakeBeforeCreateBooking(
  sourceMessages: RuntimeGatewayChatRequest["messages"],
  toolExecutions: ToolCallLoopResult["toolExecutions"],
  trustedCustomerId?: string | null,
): boolean {
  if (hasTrustedBookingIdentity(trustedCustomerId)) return false;
  if (!requiresBookingIntakeBeforeCustomerTools(sourceMessages, toolExecutions, trustedCustomerId)) {
    return false;
  }
  return !readResolvedCustomerId(toolExecutions, sourceMessages, trustedCustomerId);
}

function bookingIntakeMessage(
  intake: PatientIntake | null,
  messages: RuntimeGatewayChatRequest["messages"] = [],
  toolExecutions: ToolCallLoopResult["toolExecutions"] = [],
): string {
  const invalidPhone = readInvalidBookingPhoneMessage(intake, messages);
  if (invalidPhone) return invalidPhone;
  if (
    hasUserSelectedBookingSlot(messages, toolExecutions) &&
    !patientIntakeIsComplete(intake)
  ) {
    if (intake?.phone?.trim() && !intake.name?.trim()) return BOOKING_INTAKE_NAME_MESSAGE;
    if (intake?.name?.trim() && !isCompleteCustomerFullName(intake.name)) {
      return BOOKING_INTAKE_FULL_NAME_MESSAGE;
    }
    if (intake?.name?.trim() && !intake.phone?.trim()) return BOOKING_PHONE_INTAKE_MESSAGE;
    return BOOKING_INTAKE_MESSAGE;
  }
  if (intake?.name?.trim() && !isCompleteCustomerFullName(intake.name)) {
    return BOOKING_INTAKE_FULL_NAME_MESSAGE;
  }
  if (intake?.name?.trim() && !intake.phone?.trim()) return BOOKING_PHONE_INTAKE_MESSAGE;
  if (intake?.phone?.trim() && !intake.name?.trim()) return BOOKING_INTAKE_NAME_MESSAGE;
  return BOOKING_INTAKE_MESSAGE;
}

function looksLikeBookingIntent(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  // Reschedule / attendance phrases contain "ميعاد"/"حجز" but are not create-booking intent.
  if (customerWantsRescheduleFromText(trimmed)) return false;
  if (
    /تسجيل\s*(?:حضور|انصراف)|check[_\s-]?in|check[_\s-]?out|أسجل\s*(?:حضور|انصراف)/i.test(
      trimmed,
    )
  ) {
    return false;
  }
  return /(?:عايز(?:ة|ه)?|أ?حجز|حجز|ميعاد|موعد|دكتور|doctor|adam|كشف|availability|booking|book)/i.test(
    trimmed,
  );
}

function isSlotPickMessage(text: string): boolean {
  const trimmed = text.trim();
  const ascii = convertArabicDigitsToAscii(trimmed);
  const hasDate =
    /\b(20\d{2}-\d{2}-\d{2})\b/.test(ascii) || /\b\d{2}-\d{2}-(20\d{2})\b/.test(ascii);
  const hasTime = /\d{1,2}:\d{2}/.test(ascii);
  if (hasDate && hasTime) return true;
  // Arabic weekday + time (الأحد ٩ مساء) — selection against an offered slot.
  if (parseArabicWeekdayAndTime(trimmed) !== null) return true;
  // Relative Arabic date+time ("النهارده الساعة 9") binds against offered slots.
  if (parseRelativeArabicBookingSlot(trimmed) !== null) return true;
  // Bare clock: "٩:١٥", "9:15", "الساعة 9", "9 مساء" after a fresh availability list.
  return /^(?:الساعة\s*)?\d{1,2}(?::\d{2})?\s*(?:صباح|صباحا|صباحًا|صبح|الصبح|مساء|مساءً)?\.?$/i.test(
    ascii.trim(),
  );
}

function indexOfLastSlotPickMessage(userMessages: string[]): number {
  for (let index = userMessages.length - 1; index >= 0; index -= 1) {
    if (isSlotPickMessage(userMessages[index]!)) return index;
  }
  return -1;
}

function indexOfFirstSlotPickMessage(userMessages: string[]): number {
  for (let index = 0; index < userMessages.length; index += 1) {
    if (isSlotPickMessage(userMessages[index]!)) return index;
  }
  return -1;
}

function looksLikeCasualReply(value: string): boolean {
  const trimmed = value.trim();
  return /^(?:هاي|هلا|أ?هلا|مرحبا+|hi|hello|hey|yes|ok|okay|أ?يوه|ايوه|تمام|ماشي|thanks|شكرا|سلام)$/i.test(
    trimmed,
  );
}

function looksLikePatientName(
  value: string,
  messages: RuntimeGatewayChatRequest["messages"] = [],
): boolean {
  const trimmed = value.trim();
  if (!/[\u0600-\u06FF]{3,}/.test(trimmed)) return false;
  if (looksLikeCasualReply(trimmed)) return false;
  if (/\d{4}-\d{2}-\d{2}/.test(trimmed)) return false;
  if (/\d{1,2}:\d{2}/.test(trimmed)) return false;
  if (/^(?:يوم|احجز|موعد|ميعاد|ساعة|مرحبا|السلام|مساء|صباح)/i.test(trimmed)) return false;
  if (/^\d{1,2}[-/]\d{1,2}/.test(trimmed)) return false;
  if (looksLikeBookingIntent(trimmed)) return false;
  if (trimmed.split(/\s+/).length > 4) return false;
  if (isSchedulingCatalogServiceName(trimmed, messages)) return false;
  return true;
}

const CUSTOMER_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isCustomerUuid(value: string): boolean {
  return CUSTOMER_UUID_PATTERN.test(value);
}

function isBookingPlaceholderReply(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  if (/(?:تم\s+الحجز|تم\s+حجز|bookingId|confirmed)/i.test(normalized)) return false;
  if (/(?:سأقوم|سيقوم|هقوم|هنقوم).{0,40}(?:حجز|الحجز)/i.test(normalized)) return true;
  if (/(?:هبدأ|هقوم|سأبدأ|هنبدأ|أبدأ|ابدأ)/.test(normalized) && /(?:حجز|إتمام|اتمام)/.test(normalized)) {
    return true;
  }
  if (/(?:إتمام|اتمام)\s+عملية\s+الحجز/.test(normalized)) return true;
  if (/(?:الآن|الان).{0,20}(?:حجز|الحجز)/.test(normalized)) return true;
  if (/(?:حجز|book(?:ing)?)/i.test(normalized) && /(?:انتظر|انتظري|الانتظار|لحظة)/i.test(normalized)) {
    return true;
  }
  return false;
}

function isPatientIntakeReply(text: string): boolean {
  return /محتاجين (?:اسم (?:المريض|العميل)|رقم موبايل)/.test(text.trim());
}

function isPhoneOnlyIntakeReply(text: string): boolean {
  const normalized = text.trim();
  return /محتاجين رقم موبايل/.test(normalized) && !/اسم (?:المريض|العميل)/.test(normalized);
}

/**
 * Broader detector for LLM paraphrases that ask the customer to re-identify
 * (name/phone) after WhatsApp trusted identity is already resolved.
 */
function isTrustedIdentityReaskReply(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  if (isPatientIntakeReply(normalized) || isPhoneOnlyIntakeReply(normalized)) return true;
  if (/تأكيد اسمك ورقم/.test(normalized)) return true;
  // Standalone phone asks after trusted identity (LLM paraphrase).
  if (
    /(?:رقم\s*(?:ال)?(?:هاتف|موبايل|تليفون)|موبايلك)/.test(normalized) &&
    /(?:اطلب|محتاج|ممكن|ابعت|قول|تزويد|الخاص)/.test(normalized) &&
    !/\bBK-\d+\b/i.test(normalized)
  ) {
    return true;
  }
  // Cancel/search phone prompts must not appear when WhatsApp identity is already trusted.
  if (
    /(?:رقم\s*(?:ال)?(?:هاتف|موبايل|تليفون)|موبايلك)/.test(normalized) &&
    /(?:إلغاء|الغي|ألغي|حجز|حجوز)/.test(normalized)
  ) {
    return true;
  }
  if (
    /(?:اسمك|اسم (?:المريض|العميل|الشخص)).{0,48}(?:رقم|موبايل|هاتف|تليفون)/.test(normalized) &&
    /(?:حجز|إتمام|اتمام|نكمّل|نكمل|معلومات)/.test(normalized)
  ) {
    return true;
  }
  if (
    /(?:رقم|موبايل|هاتف|تليفون).{0,48}(?:اسمك|اسم (?:المريض|العميل))/.test(normalized) &&
    /(?:حجز|إتمام|اتمام|نكمّل|نكمل|معلومات)/.test(normalized)
  ) {
    return true;
  }
  return false;
}

const TRUSTED_IDENTITY_REASK_CONTINUE_MESSAGE =
  "تمام، بياناتك مسجّلة عندنا بالفعل. اختَر أو أكّد المعاد المناسب من المواعيد المتاحة وسأكمّل الحجز مباشرة.";

function bookingIntakePromptForMessages(
  messages: RuntimeGatewayChatRequest["messages"],
  toolExecutions: ToolCallLoopResult["toolExecutions"] = [],
): string {
  return bookingIntakeMessage(readPatientIntakeFromConversation(messages), messages, toolExecutions);
}

function conversationShowsRecentBookingAvailability(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  return messages.some(
    (message) =>
      message.role === "assistant" &&
      /المواعيد\s*المتاحة|•\s*\d{1,2}:\d{2}/i.test(String(message.content ?? "")),
  );
}

function resolveEmbeddedBookingIntentSlot(
  messages: RuntimeGatewayChatRequest["messages"],
  toolExecutions: ToolCallLoopResult["toolExecutions"] = [],
): CanonicalSchedulingSlot | null {
  const ids = readSchedulingCatalogIds(messages, toolExecutions);
  if (!ids) return null;
  const attemptStart = indexOfLastBookingAttemptStart(messages);
  for (let index = attemptStart; index < messages.length; index += 1) {
    const message = messages[index];
    if (message?.role !== "user") continue;
    const text = typeof message.content === "string" ? message.content : "";
    if (!looksLikeBookingIntent(text)) continue;
    const selection = parseArabicWeekdayAndTime(text);
    if (!selection) continue;
    const date = nextCairoYmdForWeekday(selection.weekday);
    if (!date) continue;
    return {
      serviceId: ids.serviceId,
      resourceId: ids.resourceId,
      date,
      slotStart: selection.slotStart,
    };
  }
  return null;
}

function conversationInActiveBookingFlow(
  messages: RuntimeGatewayChatRequest["messages"],
  toolExecutions: ToolCallLoopResult["toolExecutions"] = [],
): boolean {
  if (conversationShowsRecentBookingAvailability(messages)) return true;
  if (readOfferedSlotsFromToolExecutions(toolExecutions, messages).length > 0) return true;
  if (resolveEmbeddedBookingIntentSlot(messages, toolExecutions)) return true;
  const attemptStart = indexOfLastBookingAttemptStart(messages);
  return messages.slice(attemptStart).some(
    (message) =>
      message.role === "assistant" &&
      /محتاجين اسم|الاسم الكامل|رقم موبايل.*(?:حجز|كمل|كمّل)/i.test(String(message.content ?? "")),
  );
}

function normalizePatientIntakeReply(
  text: string,
  messages: RuntimeGatewayChatRequest["messages"] = [],
  toolExecutions: ToolCallLoopResult["toolExecutions"] = [],
  trustedCustomerId?: string | null,
): string {
  // Trusted WhatsApp/CRM identity already resolved — never re-ask for name/phone intake.
  if (hasTrustedBookingIdentity(trustedCustomerId)) {
    if (isTrustedIdentityReaskReply(text)) {
      return TRUSTED_IDENTITY_REASK_CONTINUE_MESSAGE;
    }
    return text;
  }

  if (latestUserExplicitBookingLookup(messages)) {
    if (!readPhoneForBookingSearch(messages)) {
      return EXPLICIT_BOOKING_LOOKUP_PHONE_REPLY;
    }
    return text;
  }
  const intake = readPatientIntakeFromConversation(messages);
  const invalidPhone = readInvalidBookingPhoneMessage(intake, messages);
  if (invalidPhone) return invalidPhone;
  if (
    intake?.name?.trim() &&
    !isCompleteCustomerFullName(intake.name) &&
    !intake.phone?.trim() &&
    conversationInActiveBookingFlow(messages, toolExecutions)
  ) {
    return BOOKING_INTAKE_FULL_NAME_MESSAGE;
  }
  if (
    hasUserSelectedBookingSlot(messages, toolExecutions) &&
    !patientIntakeIsComplete(intake)
  ) {
    if (intake?.name?.trim() && !isCompleteCustomerFullName(intake.name)) {
      return BOOKING_INTAKE_FULL_NAME_MESSAGE;
    }
    if (isPhoneOnlyIntakeReply(text) || isPatientIntakeReply(text)) {
      return bookingIntakePromptForMessages(messages, toolExecutions);
    }
  }
  if (
    isPatientIntakeReply(text) &&
    /رقم موبايل|رقم التليفون/.test(text) &&
    Boolean(intake?.phone?.trim()) &&
    !intake?.name?.trim()
  ) {
    return BOOKING_INTAKE_NAME_MESSAGE;
  }
  if (
    Boolean(intake?.phone?.trim()) &&
    Boolean(intake?.name?.trim()) &&
    !isCompleteCustomerFullName(intake?.name) &&
    (isPatientIntakeReply(text) || /اسم (?:المريض|العميل)/.test(text))
  ) {
    return BOOKING_INTAKE_FULL_NAME_MESSAGE;
  }
  return text;
}

function conversationAlreadyHasPatientDetails(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  return patientIntakeIsComplete(readPatientIntakeFromConversation(messages));
}

function lastUserMessageIsBookingNudge(messages: RuntimeGatewayChatRequest["messages"]): boolean {
  const last = [...messages].reverse().find((message) => message.role === "user");
  const text = typeof last?.content === "string" ? last.content.trim() : "";
  if (!text) return false;
  return /^[?؟.\s]+$/.test(text) || /بعتهم|كمل|كمّل|اتمم|أتمم|إتمام/.test(text);
}

function shouldSkipAvailabilityRestart(
  messages: RuntimeGatewayChatRequest["messages"],
  toolExecutions: ToolCallLoopResult["toolExecutions"],
): boolean {
  const relative = parseRelativeArabicBookingSlot(latestUserTextFromMessages(messages));
  if (relative?.date) {
    const alreadySearchedRequestedDate = toolExecutions.some(
      (execution) =>
        execution.toolKey === "search_availability" &&
        String((execution.input as { date?: unknown } | undefined)?.date ?? "").trim() === relative.date,
    );
    if (alreadySearchedRequestedDate) return true;
  }
  if (shouldDropPriorSchedulingSeed(messages)) return false;
  if (readResolvedCustomerId(toolExecutions, messages)) return true;
  return lastUserMessageIsBookingNudge(messages);
}

function readResolvedCustomerId(
  toolExecutions: ToolCallLoopResult["toolExecutions"],
  sourceMessages: RuntimeGatewayChatRequest["messages"] = [],
  trustedCustomerId?: string | null,
): string | null {
  if (hasTrustedBookingIdentity(trustedCustomerId)) {
    return trustedCustomerId!.trim();
  }

  const intake = readPatientIntakeFromConversation(sourceMessages);

  for (const execution of [...toolExecutions].reverse()) {
    if (execution.status !== "succeeded" || !execution.output) continue;
    if (execution.toolKey === "create_customer") {
      if (!patientIntakeIsComplete(intake)) continue;
      const customerId = execution.output.customerId;
      if (typeof customerId === "string" && isCustomerUuid(customerId)) return customerId;
    }
  }

  if (!patientIntakeIsComplete(intake)) return null;

  for (const execution of [...toolExecutions].reverse()) {
    if (execution.status !== "succeeded" || !execution.output) continue;
    if (execution.toolKey !== "search_customer") continue;
    const customers = Array.isArray(execution.output.customers)
      ? execution.output.customers
      : Array.isArray(execution.output.results)
        ? execution.output.results
        : [];
    const first = customers[0] as { id?: unknown; name?: unknown } | undefined;
    if (!first || typeof first.id !== "string" || !isCustomerUuid(first.id)) continue;
    const customerName = typeof first.name === "string" ? first.name : "";
    if (intake?.name && customerName && !personNamesMatch(customerName, intake.name)) {
      continue;
    }
    if (intake?.name && customerName && isInsufficientNameAgainstExpected(intake.name, customerName)) {
      continue;
    }
    return first.id;
  }
  return null;
}

const CREATE_BOOKING_WITHOUT_USER_SLOT_DENIAL =
  "The customer has not selected a date and time yet. Show available options and wait for an explicit slot selection before create_booking.";

function stripEmbeddedPhoneFromName(value: string, phone: string | undefined): string {
  let result = value.trim();
  if (!result) return result;

  const candidates = new Set<string>();
  if (phone?.trim()) {
    candidates.add(phone.trim());
    const validated = validateEgyptMobilePhone(phone);
    if (validated.valid) {
      candidates.add(validated.normalized);
      candidates.add(validated.local);
    }
  }
  const embedded = extractPhoneFromText(value);
  if (embedded) {
    candidates.add(embedded);
    const validated = validateEgyptMobilePhone(embedded);
    if (validated.valid) {
      candidates.add(validated.normalized);
      candidates.add(validated.local);
    }
  }

  for (const candidate of candidates) {
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(escaped, "g"), "").trim();
    const digits = candidate.replace(/\D/g, "");
    if (digits) {
      result = result.replace(new RegExp(digits, "g"), "").trim();
    }
  }

  return result.replace(/\s+/g, " ").trim();
}

function readPatientIntakeFromConversation(
  messages: RuntimeGatewayChatRequest["messages"],
): PatientIntake | null {
  const userMessages = messages
    .filter((message) => message.role === "user")
    .map((message) => (typeof message.content === "string" ? message.content : ""))
    .filter(Boolean);

  // Use the FIRST slot pick in this booking attempt so name/phone collected after the
  // initial selection survive a later re-pick (e.g. after SLOT_UNAVAILABLE).
  const attemptStart = indexOfLastBookingAttemptStart(messages);
  const userMessageIndexes: number[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    if (messages[index]?.role === "user") userMessageIndexes.push(index);
  }
  let attemptUserOffset = 0;
  for (let i = 0; i < userMessageIndexes.length; i += 1) {
    if (userMessageIndexes[i]! >= attemptStart) {
      attemptUserOffset = i;
      break;
    }
  }
  const attemptUserMessages = userMessages.slice(attemptUserOffset);
  const firstSlotInAttempt = indexOfFirstSlotPickMessage(attemptUserMessages);
  const intakeMessages =
    firstSlotInAttempt >= 0 ? attemptUserMessages.slice(firstSlotInAttempt) : attemptUserMessages;

  let name: string | undefined;
  let age: string | undefined;
  let phone: string | undefined;

  for (const text of intakeMessages) {
    const trimmed = text.trim();
    if (/^[\s?؟.]+$/.test(trimmed)) continue;

    const nextPhone = extractPhoneFromText(trimmed);
    if (nextPhone) phone = nextPhone;
    for (const line of trimmed.split(/\n+/).map((l) => l.trim()).filter(Boolean)) {
      const linePhone = extractPhoneFromText(line);
      if (linePhone) phone = linePhone;
    }

    const labeledName = /اسم(?:\s*(?:المريض|العميل))?\s*[:：]\s*([^\n.]+?)(?=\s*(?:\.|$|،|,|عمر|العمر|رقمي|موبايل|هاتف|phone)|$)/i
      .exec(trimmed)?.[1]
      ?.trim();
    const myName = /(?:^|[.\s،,])اسمي\s+([^\n.،,]+?)(?=\s*(?:\.|$|،|,|عمر|العمر|رقمي|موبايل|هاتف|phone|ورقمي)|$)/i
      .exec(trimmed)?.[1]
      ?.trim();
    const labeledAge = /(?:^|[.\s،,])عمر(?:\s*المريض)?\s*[:：]?\s*([0-9٠-٩]{1,3})/i.exec(trimmed)?.[1]?.trim();
    if (labeledName) {
      const candidateName = stripEmbeddedPhoneFromName(labeledName, phone);
      if (candidateName && looksLikePatientName(candidateName, messages)) name = candidateName;
    }
    if (myName) {
      const candidateName = stripEmbeddedPhoneFromName(myName, phone);
      if (candidateName && looksLikePatientName(candidateName, messages)) name = candidateName;
    }
    if (labeledAge) age = labeledAge;

    if (isSlotPickMessage(trimmed)) continue;
    if (looksLikeBookingIntent(trimmed)) continue;
    if (/\d{1,2}:\d{2}/.test(trimmed) && !/[\u0600-\u06FF]{3,}/.test(trimmed)) continue;

    const lines = trimmed
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length >= 1 && looksLikePatientName(lines[0]!, messages)) {
      const candidateName = stripEmbeddedPhoneFromName(lines[0]!, phone);
      if (candidateName && looksLikePatientName(candidateName, messages)) {
        name = candidateName;
      }
    }

    if (lines.length >= 2 && name && lines[0] === name) {
      const ageMatch = /^(?:\d{1,2}|[٠-٩]{1,2})$/.exec(lines[1]!);
      if (ageMatch) {
        age = lines[1]!;
      }
    }

    if (lines.length >= 2 && !name) {
      const candidateName = lines.find((line) => looksLikePatientName(line, messages));
      const candidateAge = lines.find((line) => /^(?:\d{1,2}|[٠-٩]{1,2})$/.test(line));
      if (candidateName) {
        const cleanedName = stripEmbeddedPhoneFromName(candidateName, phone);
        if (cleanedName && looksLikePatientName(cleanedName, messages)) name = cleanedName;
      }
      if (candidateAge) age = candidateAge;
    }
  }

  if (!name?.trim() && !phone?.trim() && !age?.trim()) return null;
  return { name: name?.trim() ?? "", age, phone };
}

function buildPatientBookingNotes(messages: RuntimeGatewayChatRequest["messages"]): string | undefined {
  const intake = readPatientIntakeFromConversation(messages);
  if (!intake) return undefined;
  const parts = [`العميل: ${intake.name}`];
  if (intake.age) parts.push(`العمر: ${intake.age}`);
  if (intake.phone) parts.push(`الموبايل: ${intake.phone}`);
  return parts.join(" | ");
}

async function forceEnsureCustomerProfile(input: {
  tools: RuntimeToolPort;
  ctx: ServiceContext;
  conversationId: string;
  allowedToolKeys: string[];
  sourceMessages: RuntimeGatewayChatRequest["messages"];
  toolExecutions: ToolCallLoopResult["toolExecutions"];
  trustedCustomerId?: string | null;
}): Promise<void> {
  // Phase 2 — trusted channel identity already resolves CRM customer.
  if (hasTrustedBookingIdentity(input.trustedCustomerId)) return;
  if (customerWantsCancelBooking(input.sourceMessages)) return;
  if (!input.allowedToolKeys.includes("create_customer")) return;
  const intake = readPatientIntakeFromConversation(input.sourceMessages);
  const wantsTicket = customerWantsAnyTicketFlow(input.sourceMessages);
  const invalidPhone = readInvalidBookingPhoneMessage(intake, input.sourceMessages);
  if (invalidPhone) return;
  const intakeReady = wantsTicket
    ? ticketCustomerIntakeIsComplete(intake)
    : patientIntakeIsComplete(intake);
  if (!intake || !intakeReady) return;

  const hasCreateCustomer = input.toolExecutions.some(
    (execution) =>
      execution.toolKey === "create_customer" &&
      execution.status === "succeeded" &&
      execution.output?.success === true,
  );
  if (hasCreateCustomer) return;

  const routed = await input.tools.route(input.ctx, {
    conversationId: input.conversationId,
    toolKey: "create_customer",
    input: {
      name: intake.name,
      phone: intake.phone,
    },
    triggeredBy: "llm",
  });
  input.toolExecutions.push({
    toolKey: routed.toolKey,
    executionId: routed.executionId,
    status: routed.status,
    output: routed.output,
    durationMs: routed.durationMs,
  });
}

function cairoCalendarYmd(offsetDays = 0): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (offsetDays === 0) return today;
  const [year, month, day] = today.split("-").map((part) => Number(part));
  const utc = new Date(Date.UTC(year!, month! - 1, day! + offsetDays));
  return utc.toISOString().slice(0, 10);
}

/** JS weekday (0=Sunday … 6=Saturday) for a YYYY-MM-DD calendar date in Africa/Cairo. */
function cairoJsWeekday(isoDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate.trim())) return null;
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    weekday: "short",
  }).format(new Date(`${isoDate.trim()}T12:00:00Z`));
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[label] ?? null;
}

/** Next (or today) Africa/Cairo calendar date matching a JS weekday. */
function nextCairoYmdForWeekday(targetWeekday: number): string | null {
  if (!Number.isInteger(targetWeekday) || targetWeekday < 0 || targetWeekday > 6) return null;
  for (let offset = 0; offset <= 7; offset += 1) {
    const ymd = cairoCalendarYmd(offset);
    if (cairoJsWeekday(ymd) === targetWeekday) return ymd;
  }
  return null;
}

/**
 * Reschedule turns often use weekday+time without a prior availability offer
 * ("الخميس الساعة 09:15 مساء"). Map that to an absolute Cairo date+slot.
 */
function parseRescheduleWeekdaySlotFromMessages(
  messages: RuntimeGatewayChatRequest["messages"],
): { date: string; slotStart: string } | null {
  for (const message of [...messages].reverse()) {
    if (message.role !== "user") continue;
    const text = typeof message.content === "string" ? message.content : "";
    if (!text.trim()) continue;
    const selection = parseArabicWeekdayAndTime(text);
    if (!selection) continue;
    const date = nextCairoYmdForWeekday(selection.weekday);
    if (!date) continue;
    return { date, slotStart: selection.slotStart };
  }
  return null;
}

function normalizeArabicWeekdayKey(token: string): string {
  return token
    .trim()
    .toLowerCase()
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه");
}

/** Map Arabic weekday token → JS weekday (0=Sunday). */
function arabicWeekdayTokenToJs(token: string): number | null {
  const key = normalizeArabicWeekdayKey(token);
  const map: Record<string, number> = {
    الاحد: 0,
    الاثنين: 1,
    الثلاثاء: 2,
    الاربعاء: 3,
    الخميس: 4,
    الجمعه: 5,
    السبت: 6,
  };
  return map[key] ?? null;
}

const ARABIC_TODAY_RE = /النهارده|النهاردة|اليوم(?!\s*ال)/i;
const ARABIC_TOMORROW_RE = /بكره|بكرا|غداً|غدا|غدًا/i;
const ARABIC_MORNING_RE = /صباح|صباحا|صباحًا|صبح|الصبح/i;
const ARABIC_PERIOD_RE = /صباح|صباحا|صباحًا|صبح|الصبح|مساء|مساءً|ظهر|ظهرا|ظهرًا/i;

function foldArabicRelativeDateText(text: string): string {
  return convertArabicDigitsToAscii(text)
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه");
}

function hasArabicTomorrowToken(text: string): boolean {
  return ARABIC_TOMORROW_RE.test(foldArabicRelativeDateText(text));
}

function hasArabicTodayToken(text: string): boolean {
  return ARABIC_TODAY_RE.test(foldArabicRelativeDateText(text));
}

function parseArabicClockToSlotStart(text: string): string | null {
  const normalized = convertArabicDigitsToAscii(text);
  let hour: number | null = null;
  let minute = 0;

  const hhmm = /(?:^|[^\d])(\d{1,2}):(\d{2})(?:[^\d]|$)/.exec(normalized);
  if (hhmm) {
    hour = Number(hhmm[1]);
    minute = Number(hhmm[2]);
    if (/مساء|مساءً/i.test(normalized) && hour > 0 && hour < 12) hour += 12;
    if (ARABIC_MORNING_RE.test(normalized) && hour === 12) hour = 0;
  } else {
    const clock =
      /(?:الساعة|الساعه)\s*(\d{1,2})\s*(?:و\s*)?(?:نص|نصف)?\s*(صباح|صباحا|صباحًا|صبح|الصبح|مساء|مساءً|ظهر|ظهرا|ظهرًا)?|(\d{1,2})\s*(?:و\s*)?(?:نص|نصف)?\s*(صباح|صباحا|صباحًا|صبح|الصبح|مساء|مساءً|ظهر|ظهرا|ظهرًا)/i.exec(
        normalized,
      );
    if (clock) {
      hour = Number(clock[1] ?? clock[3]);
      if (/نص|نصف/i.test(normalized)) minute = 30;
      const period = clock[2] ?? clock[4] ?? "";
      if (/مساء|ظهر/i.test(period) && hour > 0 && hour < 12) hour += 12;
      if (ARABIC_MORNING_RE.test(period) && hour === 12) hour = 0;
      if (!period && /مساء|مساءً/i.test(normalized) && hour > 0 && hour < 12) hour += 12;
      if (!period && ARABIC_MORNING_RE.test(normalized) && hour === 12) hour = 0;
    }
  }

  if (hour === null || Number.isNaN(hour) || hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Parse Arabic weekday + time selection (no absolute date).
 * Examples: "الأحد ٩ مساء", "الاحد 9 مساء", "الأحد الساعة ٩ مساء", "الاثنين 10 صباحًا", "الاحد ٩:١٥".
 */
function parseArabicWeekdayAndTime(
  text: string,
): { weekday: number; slotStart: string; hasExplicitPeriod: boolean } | null {
  const normalized = convertArabicDigitsToAscii(text);
  if (!normalized.trim()) return null;
  // Explicit old-booking lookup must never be treated as slot selection.
  if (
    /حجوزاتي\s*(?:ال)?قديمة/i.test(normalized) ||
    /(?:عايز|محتاج|ممكن).*(?:اعرف|اشوف|أعرف|أشوف).*(?:حجوز|مواعيد)/i.test(normalized)
  ) {
    return null;
  }

  const weekdayMatch =
    /(السبت|الأحد|الاحد|الاثنين|الثلاثاء|الأربعاء|الاربعاء|الخميس|الجمعة)/i.exec(normalized);
  if (!weekdayMatch?.[1]) return null;
  const weekday = arabicWeekdayTokenToJs(weekdayMatch[1]);
  if (weekday === null) return null;

  const slotStart = parseArabicClockToSlotStart(normalized);
  if (!slotStart) return null;
  const hasExplicitPeriod = ARABIC_PERIOD_RE.test(normalized);
  // Require an explicit period or HH:mm so bare "الأحد" alone does not select.
  if (!/\d{1,2}:\d{2}/.test(normalized) && !hasExplicitPeriod) {
    return null;
  }

  return { weekday, slotStart, hasExplicitPeriod };
}

/** Parse Arabic/relative date+time (e.g. "الساعة 7 مساء النهاردة") into canonical slot. */
function parseRelativeArabicBookingSlot(
  text: string,
): { date: string; slotStart: string } | null {
  const normalized = convertArabicDigitsToAscii(text);
  const slotStart = parseArabicClockToSlotStart(normalized);
  if (!slotStart) return null;

  let date: string | null = null;
  const iso = /\b(20\d{2}-\d{2}-\d{2})\b/.exec(normalized);
  const dmy = /\b(\d{2})-(\d{2})-(20\d{2})\b/.exec(normalized);
  if (iso?.[1]) date = iso[1];
  else if (dmy) date = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  else if (hasArabicTodayToken(normalized)) date = cairoCalendarYmd(0);
  else if (hasArabicTomorrowToken(normalized)) date = cairoCalendarYmd(1);

  if (!date) return null;
  return { date, slotStart };
}

function latestUserMessageHasBookingSlot(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return (
    parseRelativeArabicBookingSlot(trimmed) !== null ||
    parseArabicWeekdayAndTime(trimmed) !== null ||
    parseArabicTimeOnlySelection(trimmed) !== null ||
    isSlotPickMessage(trimmed)
  );
}

function isBareCreateBookingOpener(text: string): boolean {
  return /^(?:حجز|عايز(?:ة|ه)?\s*(?:احجز|أحجز|حجز)ز*|محتاج(?:ة)?\s*(?:احجز|أحجز|حجز)ز*|أنا?\s+عايز(?:ة|ه)?\s+(?:احجز|أحجز|حجز)ز*|احجزلي)[!.؟?\s]*$/iu.test(
    text.trim(),
  );
}

function isFreshCreateBookingStartWithoutSlot(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  const latest = latestUserTextFromMessages(messages).trim();
  if (!isBareCreateBookingOpener(latest)) return false;
  return !latestUserMessageHasBookingSlot(latest);
}

function shouldDropPriorSchedulingSeed(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  if (shouldInvalidatePriorSchedulingSeed(messages)) return true;
  if (isFreshCreateBookingStartWithoutSlot(messages)) return true;
  return parseRelativeArabicBookingSlot(latestUserTextFromMessages(messages)) !== null;
}

function parseAllSlotsFromSearchAvailabilityOutput(
  output: Record<string, unknown>,
): CanonicalSchedulingSlot[] {
  if (!(output.success === true || availabilityOutputHasSlots(output))) return [];
  const serviceId = String(output.serviceId ?? "").trim();
  const resources = output.resources;
  if (!isSchedulingUuid(serviceId) || !Array.isArray(resources)) return [];

  const slots: CanonicalSchedulingSlot[] = [];
  for (const resource of resources) {
    if (!resource || typeof resource !== "object") continue;
    const resourceId = String((resource as { resourceId?: unknown }).resourceId ?? "").trim();
    if (!isSchedulingUuid(resourceId)) continue;
    const resourceSlots = Array.isArray((resource as { slots?: unknown }).slots)
      ? ((resource as { slots: unknown[] }).slots)
      : [];
    for (const slot of resourceSlots) {
      if (!slot || typeof slot !== "object") continue;
      const date = typeof (slot as { date?: unknown }).date === "string"
        ? (slot as { date: string }).date.trim()
        : "";
      const start = typeof (slot as { start?: unknown }).start === "string"
        ? (slot as { start: string }).start.trim()
        : "";
      if (!date || !start) continue;
      slots.push({
        serviceId,
        resourceId,
        date,
        slotStart: normalizeSchedulingSlotStart(start),
      });
    }
  }
  return slots;
}

function parseOfferedSlotsFromToolPayload(
  toolKey: string,
  output: Record<string, unknown>,
): CanonicalSchedulingSlot[] {
  if (toolKey === "search_availability") {
    return parseAllSlotsFromSearchAvailabilityOutput(output);
  }
  const single = parseCanonicalSlotFromToolOutput(toolKey, output);
  return single ? [single] : [];
}

/**
 * Parse find_next customerFacingMessage for date/time when tool JSON is absent from history.
 * IDs come from the scheduling catalog in the conversation.
 */
function parseOfferedSlotFromFindNextFacing(
  text: string,
  messages: RuntimeGatewayChatRequest["messages"],
): CanonicalSchedulingSlot | null {
  const normalized = convertArabicDigitsToAscii(text);
  if (!/أقرب\s*موعد\s*متاح/i.test(normalized)) return null;

  const timeMatch =
    /الساعة\s*(\d{1,2}):(\d{2})\s*(صباحًا|صباحا|ظهرًا|ظهرا|مساءً|مساء)/i.exec(normalized);
  if (!timeMatch) return null;
  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const period = timeMatch[3] ?? "";
  if (/مساء|ظهر/i.test(period) && hour > 0 && hour < 12) hour += 12;
  if (/صباح/i.test(period) && hour === 12) hour = 0;
  const slotStart = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

  // Prefer ISO embedded in the same message; otherwise Arabic day/month/year digits.
  let date: string | null = null;
  const iso = /\b(20\d{2}-\d{2}-\d{2})\b/.exec(normalized);
  if (iso?.[1]) {
    date = iso[1];
  } else {
    const arabicDate =
      /(\d{1,2})\s+(يناير|فبراير|مارس|ابريل|أبريل|مايو|يونيو|يوليو|اغسطس|أغسطس|سبتمبر|اكتوبر|أكتوبر|نوفمبر|ديسمبر)\s+(20\d{2})/i.exec(
        normalized,
      );
    if (arabicDate) {
      const monthMap: Record<string, string> = {
        يناير: "01",
        فبراير: "02",
        مارس: "03",
        ابريل: "04",
        أبريل: "04",
        مايو: "05",
        يونيو: "06",
        يوليو: "07",
        اغسطس: "08",
        أغسطس: "08",
        سبتمبر: "09",
        اكتوبر: "10",
        أكتوبر: "10",
        نوفمبر: "11",
        ديسمبر: "12",
      };
      const monthKey = arabicDate[2]!.replace(/[أإآ]/g, "ا");
      const month =
        monthMap[arabicDate[2]!] ??
        monthMap[monthKey] ??
        null;
      if (month) {
        date = `${arabicDate[3]}-${month}-${arabicDate[1]!.padStart(2, "0")}`;
      }
    }
  }
  if (!date) return null;

  const ids = readSchedulingCatalogIds(messages, []);
  if (!ids) return null;
  return {
    serviceId: ids.serviceId,
    resourceId: ids.resourceId,
    date,
    slotStart,
  };
}

const ARABIC_MONTH_TO_NUMBER: Record<string, string> = {
  يناير: "01",
  فبراير: "02",
  مارس: "03",
  ابريل: "04",
  أبريل: "04",
  مايو: "05",
  يونيو: "06",
  يوليو: "07",
  اغسطس: "08",
  أغسطس: "08",
  سبتمبر: "09",
  اكتوبر: "10",
  أكتوبر: "10",
  نوفمبر: "11",
  ديسمبر: "12",
};

/**
 * Parse multi-slot availability customer summary text (shown after conflict / search_availability).
 * Example lines:
 *   الأحد ٢٣ أغسطس ٢٠٢٦
 *   • 09:15 مساءً
 */
function parseOfferedSlotsFromAvailabilitySummary(
  text: string,
  messages: RuntimeGatewayChatRequest["messages"],
  toolExecutions: ToolCallLoopResult["toolExecutions"] = [],
): CanonicalSchedulingSlot[] {
  const normalized = convertArabicDigitsToAscii(text);
  if (!/المواعيد\s*المتاحة/i.test(normalized) && !/•\s*\d{1,2}:\d{2}/.test(normalized)) {
    return [];
  }

  const ids = readSchedulingCatalogIds(messages, toolExecutions);
  if (!ids) return [];

  const slots: CanonicalSchedulingSlot[] = [];
  let currentDate: string | null = null;
  for (const rawLine of normalized.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const dayHeader =
      /(?:السبت|الأحد|الاحد|الاثنين|الثلاثاء|الأربعاء|الاربعاء|الخميس|الجمعة)?\s*(\d{1,2})\s+(يناير|فبراير|مارس|ابريل|أبريل|مايو|يونيو|يوليو|اغسطس|أغسطس|سبتمبر|اكتوبر|أكتوبر|نوفمبر|ديسمبر)\s+(20\d{2})/i.exec(
        line,
      );
    if (dayHeader) {
      const month =
        ARABIC_MONTH_TO_NUMBER[dayHeader[2]!] ??
        ARABIC_MONTH_TO_NUMBER[dayHeader[2]!.replace(/[أإآ]/g, "ا")] ??
        null;
      if (month) {
        currentDate = `${dayHeader[3]}-${month}-${dayHeader[1]!.padStart(2, "0")}`;
      }
      continue;
    }

    const timeBullet =
      /(?:^|[•\-–]|\s)(\d{1,2}):(\d{2})\s*(صباحًا|صباحا|ظهرًا|ظهرا|مساءً|مساء)?/i.exec(line);
    if (!timeBullet || !currentDate) continue;
    let hour = Number(timeBullet[1]);
    const minute = Number(timeBullet[2]);
    const period = timeBullet[3] ?? "";
    if (/مساء|ظهر/i.test(period) && hour > 0 && hour < 12) hour += 12;
    if (/صباح/i.test(period) && hour === 12) hour = 0;
    // Bare bullet times in evening sections without period are uncommon; keep as parsed hour.
    slots.push({
      serviceId: ids.serviceId,
      resourceId: ids.resourceId,
      date: currentDate,
      slotStart: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    });
  }

  return slots;
}

function readOfferedSlotsFromToolExecutions(
  toolExecutions: ToolCallLoopResult["toolExecutions"],
  messages: RuntimeGatewayChatRequest["messages"] = [],
): CanonicalSchedulingSlot[] {
  for (let index = toolExecutions.length - 1; index >= 0; index -= 1) {
    const execution = toolExecutions[index];
    if (!execution || execution.status !== "succeeded") continue;
    if (!SCHEDULING_SLOT_TOOL_KEYS.has(execution.toolKey)) continue;
    const output = (execution.output ?? {}) as Record<string, unknown>;
    let slots = parseOfferedSlotsFromToolPayload(execution.toolKey, output);
    if (slots.length === 0 && execution.toolKey === "search_availability") {
      const summary = typeof output.message === "string" ? output.message : "";
      if (summary.trim()) {
        slots = parseOfferedSlotsFromAvailabilitySummary(summary, messages, toolExecutions);
      }
    }
    if (slots.length > 0) return slots;
  }
  return [];
}

/**
 * Most recent successful availability / find_next / recommendation slots shown in
 * the current booking attempt. Availability alone is NOT user selection.
 */
function readMostRecentOfferedSlotsContext(
  messages: RuntimeGatewayChatRequest["messages"],
  toolExecutions: ToolCallLoopResult["toolExecutions"] = [],
): { slots: CanonicalSchedulingSlot[]; messageIndex: number } {
  const attemptStart = indexOfLastBookingAttemptStart(messages);

  for (let index = messages.length - 1; index >= attemptStart; index -= 1) {
    const message = messages[index];
    if (!message) continue;

    if (message.role === "tool" && typeof message.content === "string") {
      try {
        const payload = JSON.parse(message.content) as Record<string, unknown>;
        // Prefer explicit tool key from adjacent assistant toolCalls when present.
        let toolKey: string | null = null;
        for (let back = index - 1; back >= attemptStart; back -= 1) {
          const prior = messages[back];
          if (prior?.role !== "assistant") continue;
          const call = (prior.toolCalls ?? []).find(
            (entry) => !message.toolCallId || entry.id === message.toolCallId,
          );
          if (call && SCHEDULING_SLOT_TOOL_KEYS.has(call.name)) {
            toolKey = call.name;
            break;
          }
          if ((prior.toolCalls ?? []).some((entry) => SCHEDULING_SLOT_TOOL_KEYS.has(entry.name))) {
            const schedulingCall = (prior.toolCalls ?? []).find((entry) =>
              SCHEDULING_SLOT_TOOL_KEYS.has(entry.name),
            );
            toolKey = schedulingCall?.name ?? null;
            break;
          }
          break;
        }
        const slots = toolKey
          ? parseOfferedSlotsFromToolPayload(toolKey, payload)
          : parseSlotFromUnknownToolPayload(payload)
            ? [parseSlotFromUnknownToolPayload(payload)!]
            : parseAllSlotsFromSearchAvailabilityOutput(payload);
        if (slots.length > 0) return { slots, messageIndex: index };
      } catch {
        // ignore non-JSON tool payloads
      }
    }

    if (message.role === "assistant") {
      for (const call of message.toolCalls ?? []) {
        if (!SCHEDULING_SLOT_TOOL_KEYS.has(call.name)) continue;
        const output = tryParseToolPayloadFromFollowingMessage(messages, index, call.id);
        if (!output) continue;
        const slots = parseOfferedSlotsFromToolPayload(call.name, output);
        if (slots.length > 0) return { slots, messageIndex: index };
      }

      const facing = String(message.content ?? "");
      const fromAvailabilitySummary = parseOfferedSlotsFromAvailabilitySummary(
        facing,
        messages,
        toolExecutions,
      );
      if (fromAvailabilitySummary.length > 0) return { slots: fromAvailabilitySummary, messageIndex: index };
      const fromFacing = parseOfferedSlotFromFindNextFacing(facing, messages);
      if (fromFacing) return { slots: [fromFacing], messageIndex: index };
    }
  }

  const fromCurrentTurn = readOfferedSlotsFromToolExecutions(toolExecutions, messages);
  if (fromCurrentTurn.length > 0 && !shouldDropPriorSchedulingSeed(messages)) {
    return { slots: fromCurrentTurn, messageIndex: -1 };
  }

  return { slots: [], messageIndex: -1 };
}

function readMostRecentOfferedSlots(
  messages: RuntimeGatewayChatRequest["messages"],
): CanonicalSchedulingSlot[] {
  return readMostRecentOfferedSlotsContext(messages).slots;
}

function slotStartHour12Parts(slotStart: string): { hour12: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(slotStart.trim());
  if (!match) return null;
  const hour24 = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour24) || !Number.isFinite(minute)) return null;
  const hour12 = hour24 % 12 || 12;
  return { hour12, minute };
}

function matchWeekdaySelectionToOfferedSlots(
  selection: { weekday: number; slotStart: string; hasExplicitPeriod?: boolean },
  offered: CanonicalSchedulingSlot[],
): CanonicalSchedulingSlot | null {
  const exactMatches: CanonicalSchedulingSlot[] = [];
  const ambiguousMatches: CanonicalSchedulingSlot[] = [];
  const selectionParts = slotStartHour12Parts(selection.slotStart);

  for (const slot of offered) {
    const weekday = cairoJsWeekday(slot.date);
    if (weekday === null || weekday !== selection.weekday) continue;
    if (slot.slotStart === selection.slotStart) {
      exactMatches.push(slot);
      continue;
    }
    // "الاحد ٩:١٥" without مساء/صباح → treat as 12h clock and match offered AM/PM.
    if (!selection.hasExplicitPeriod && selectionParts) {
      const offeredParts = slotStartHour12Parts(slot.slotStart);
      if (
        offeredParts &&
        offeredParts.hour12 === selectionParts.hour12 &&
        offeredParts.minute === selectionParts.minute
      ) {
        ambiguousMatches.push(slot);
      }
    }
  }

  if (exactMatches.length === 1) return exactMatches[0]!;
  if (exactMatches.length > 1) return exactMatches[exactMatches.length - 1]!;
  if (ambiguousMatches.length === 1) return ambiguousMatches[0]!;
  // Multiple AM/PM candidates for the same 12h clock → fail closed (ask user to clarify).
  return null;
}

function matchTimeOnlySelectionToOfferedSlots(
  selection: { slotStart: string; hasExplicitPeriod?: boolean },
  offered: CanonicalSchedulingSlot[],
): CanonicalSchedulingSlot | null {
  const exactMatches: CanonicalSchedulingSlot[] = [];
  const ambiguousMatches: CanonicalSchedulingSlot[] = [];
  const selectionParts = slotStartHour12Parts(selection.slotStart);

  for (const slot of offered) {
    if (slot.slotStart === selection.slotStart) {
      exactMatches.push(slot);
      continue;
    }
    if (!selection.hasExplicitPeriod && selectionParts) {
      const offeredParts = slotStartHour12Parts(slot.slotStart);
      if (
        offeredParts &&
        offeredParts.hour12 === selectionParts.hour12 &&
        offeredParts.minute === selectionParts.minute
      ) {
        ambiguousMatches.push(slot);
      }
    }
  }

  if (exactMatches.length === 1) return exactMatches[0]!;
  if (exactMatches.length > 1) return exactMatches[exactMatches.length - 1]!;
  if (ambiguousMatches.length === 1) return ambiguousMatches[0]!;
  return null;
}

function parseArabicTimeOnlySelection(
  text: string,
): { slotStart: string; hasExplicitPeriod: boolean } | null {
  if (parseArabicWeekdayAndTime(text)) return null;
  const normalized = convertArabicDigitsToAscii(text).trim();
  if (!normalized) return null;
  if (/\b(20\d{2}-\d{2}-\d{2})\b/.test(normalized) || /\b\d{2}-\d{2}-(20\d{2})\b/.test(normalized)) {
    return null;
  }
  // Reject relative date phrases here — resolveCanonicalSelectedSlot handles them via
  // parseRelativeArabicBookingSlot so "النهارده الساعة 9" can bind against evening offers.
  if (hasArabicTodayToken(normalized) || hasArabicTomorrowToken(normalized)) {
    return null;
  }
  if (
    !/^(?:الساعة\s*)?\d{1,2}(?::\d{2})?\s*(?:صباح|صباحا|صباحًا|صبح|الصبح|مساء|مساءً)?\.?$/i.test(normalized)
  ) {
    return null;
  }
  const slotStart = parseArabicClockToSlotStart(normalized);
  if (!slotStart) return null;
  const hasExplicitPeriod = ARABIC_PERIOD_RE.test(normalized);
  return { slotStart, hasExplicitPeriod };
}


/**
 * Explicit ISO/relative date+time from user text (not weekday-against-offer).
 */
function parseExplicitSelectedBookingSlot(
  messages: RuntimeGatewayChatRequest["messages"],
): { date: string; slotStart: string } | null {
  let date: string | null = null;
  let slotStart: string | null = null;
  const attemptStart = isFreshCreateBookingStartWithoutSlot(messages)
    ? indexOfLastBookingAttemptStart(messages)
    : 0;
  for (let index = attemptStart; index < messages.length; index += 1) {
    const message = messages[index];
    if (message?.role !== "user") continue;
    const text = typeof message.content === "string" ? message.content : "";
    const iso = /\b(20\d{2}-\d{2}-\d{2})\b/.exec(text);
    const dmy = /\b(\d{2})-(\d{2})-(20\d{2})\b/.exec(text);
    // Allow "الساعة08:00" / "08:00." / trailing punctuation — not only whitespace boundaries.
    const time = /(?:^|[^\d])(\d{1,2}:\d{2})(?:[^\d]|$)/.exec(convertArabicDigitsToAscii(text));
    if (iso?.[1]) date = iso[1];
    else if (dmy) date = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    if (time?.[1]) {
      const [hours, minutes] = time[1].split(":");
      slotStart = `${hours!.padStart(2, "0")}:${minutes}`;
    }

    // LIVE failure path: "تمام احجز لي الساعة 7 مساء النهاردة مع ADAM"
    const relative = parseRelativeArabicBookingSlot(text);
    if (relative) {
      date = relative.date;
      slotStart = relative.slotStart;
    }
  }
  if (!date || !slotStart) return null;
  return { date, slotStart };
}

/**
 * Resolve a user-selected canonical slot.
 * Weekday+time selections bind ONLY to the most recent offered availability result.
 * Availability alone never selects.
 */
function resolveCanonicalSelectedSlot(
  messages: RuntimeGatewayChatRequest["messages"],
  toolExecutions: ToolCallLoopResult["toolExecutions"] = [],
): CanonicalSchedulingSlot | null {
  const offeredContext = readMostRecentOfferedSlotsContext(messages, toolExecutions);
  const offered = offeredContext.slots;
  const offerBoundary = offeredContext.messageIndex;
  const attemptStart = isFreshCreateBookingStartWithoutSlot(messages)
    ? indexOfLastBookingAttemptStart(messages)
    : 0;
  let weekdayMatch: CanonicalSchedulingSlot | null = null;
  let timeOnlyMatch: CanonicalSchedulingSlot | null = null;
  for (let index = attemptStart; index < messages.length; index += 1) {
    if (offerBoundary >= 0 && index <= offerBoundary) continue;
    const message = messages[index];
    if (message?.role !== "user") continue;
    const content = typeof message.content === "string" ? message.content : "";
    if (!content || offered.length === 0) continue;

    const weekdaySelection = parseArabicWeekdayAndTime(content);
    if (weekdaySelection) {
      const matched = matchWeekdaySelectionToOfferedSlots(weekdaySelection, offered);
      if (matched) weekdayMatch = matched;
      continue;
    }

    const timeOnly = parseArabicTimeOnlySelection(content);
    if (timeOnly) {
      const matched = matchTimeOnlySelectionToOfferedSlots(timeOnly, offered);
      if (matched) timeOnlyMatch = matched;
    }
  }
  if (weekdayMatch) return weekdayMatch;
  if (timeOnlyMatch) return timeOnlyMatch;

  const embeddedIntent = resolveEmbeddedBookingIntentSlot(messages, toolExecutions);
  if (embeddedIntent) return embeddedIntent;

  // Booking-intent turn often embeds weekday+time before the availability offer is shown.
  if (offered.length > 0) {
    const attemptStart = indexOfLastBookingAttemptStart(messages);
    const attemptMessage = messages[attemptStart];
    if (attemptMessage?.role === "user") {
      const attemptText =
        typeof attemptMessage.content === "string" ? attemptMessage.content : "";
      const embeddedWeekday = parseArabicWeekdayAndTime(attemptText);
      if (embeddedWeekday) {
        const matched = matchWeekdaySelectionToOfferedSlots(embeddedWeekday, offered);
        if (matched) return matched;
      }
    }
  }

  const explicit = parseExplicitSelectedBookingSlot(messages);
  if (!explicit) return null;

  if (offerBoundary >= 0) {
    let explicitAfterOffer = false;
    for (let index = offerBoundary + 1; index < messages.length; index += 1) {
      const message = messages[index];
      if (message?.role !== "user") continue;
      const content = typeof message.content === "string" ? message.content : "";
      const relative = parseRelativeArabicBookingSlot(content);
      const hasIso =
        /\b(20\d{2}-\d{2}-\d{2})\b/.test(content) || /\b\d{2}-\d{2}-(20\d{2})\b/.test(content);
      const asciiContent = convertArabicDigitsToAscii(content);
      const hasTime =
        /\d{1,2}:\d{2}/.test(asciiContent) ||
        /(?:الساعة\s*)?\d{1,2}\s*(?:صباح|صباحا|صباحًا|صبح|الصبح|مساء|مساءً)?/i.test(asciiContent);
      if (relative || (hasIso && hasTime)) {
        explicitAfterOffer = true;
        break;
      }
    }
    if (!explicitAfterOffer) return null;
  }

  const exactOffer = offered.find(
    (slot) => slot.date === explicit.date && slot.slotStart === explicit.slotStart,
  );
  if (exactOffer) return exactOffer;

  // "النهارده الساعة 9" without مساء/صباح parses as 09:00 — bind uniquely to offered
  // evening 21:00 on that date when the 12-hour clock matches one offered slot.
  if (offered.length > 0) {
    let hasExplicitPeriod = false;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (offerBoundary >= 0 && index <= offerBoundary) break;
      const message = messages[index];
      if (message?.role !== "user") continue;
      const content = typeof message.content === "string" ? message.content : "";
      const relative = parseRelativeArabicBookingSlot(content);
      if (!relative) continue;
      if (relative.date !== explicit.date || relative.slotStart !== explicit.slotStart) continue;
      hasExplicitPeriod = ARABIC_PERIOD_RE.test(content);
      break;
    }
    const sameDayOffers = offered.filter((slot) => slot.date === explicit.date);
    const ambiguous = matchTimeOnlySelectionToOfferedSlots(
      { slotStart: explicit.slotStart, hasExplicitPeriod },
      sameDayOffers.length > 0 ? sameDayOffers : offered,
    );
    if (ambiguous) return ambiguous;
  }

  // Fresh offer set present: never book a slot that is not in it.
  if (offered.length > 0) return null;

  const ids = readSchedulingCatalogIds(messages, toolExecutions);
  if (!ids) return null;
  return {
    serviceId: ids.serviceId,
    resourceId: ids.resourceId,
    date: explicit.date,
    slotStart: explicit.slotStart,
  };
}

function parseSelectedBookingSlot(
  messages: RuntimeGatewayChatRequest["messages"],
  toolExecutions: ToolCallLoopResult["toolExecutions"] = [],
): { date: string; slotStart: string } | null {
  const canonical = resolveCanonicalSelectedSlot(messages, toolExecutions);
  if (canonical) return { date: canonical.date, slotStart: canonical.slotStart };
  // Reschedule and similar flows need date/time even when service/resource ids are absent.
  // When a fresh availability offer exists, never treat an off-offer explicit time as selected —
  // that would book unavailable slots like "النهارده الساعة 10" against a 21:00/21:45 list.
  const offered = readMostRecentOfferedSlotsContext(messages, toolExecutions).slots;
  if (offered.length > 0 && !customerWantsRescheduleBooking(messages)) {
    return null;
  }
  return parseExplicitSelectedBookingSlot(messages);
}

function readSchedulingIdsFromToolInput(
  toolKey: string,
  input: Record<string, unknown> | null | undefined,
): { serviceId: string; resourceId: string } | null {
  if (!input || typeof input !== "object") return null;
  if (toolKey !== "search_availability") return null;
  const serviceId = String(input.serviceId ?? "").trim();
  const resourceId = String(input.resourceId ?? "").trim();
  if (!isSchedulingUuid(serviceId) || !isSchedulingUuid(resourceId)) return null;
  return { serviceId, resourceId };
}

function readSchedulingIdsFromToolOutput(
  toolKey: string,
  output: Record<string, unknown> | null | undefined,
): { serviceId: string; resourceId: string } | null {
  if (!output || typeof output !== "object") return null;

  const slot = parseCanonicalSlotFromToolOutput(toolKey, output);
  if (slot) {
    return { serviceId: slot.serviceId, resourceId: slot.resourceId };
  }

  if (toolKey === "search_availability") {
    const serviceId = String(output.serviceId ?? "").trim();
    const resources = output.resources;
    if (!isSchedulingUuid(serviceId) || !Array.isArray(resources) || resources.length === 0) {
      return null;
    }
    const firstResource = resources[0] as { resourceId?: unknown };
    const resourceId = String(firstResource.resourceId ?? "").trim();
    if (!isSchedulingUuid(resourceId)) return null;
    return { serviceId, resourceId };
  }

  return null;
}

function readSchedulingCatalogIdsFromSuccessfulTools(
  messages: RuntimeGatewayChatRequest["messages"],
  toolExecutions: ToolCallLoopResult["toolExecutions"] = [],
): { serviceId: string; resourceId: string } | null {
  let serviceId: string | null = null;
  let resourceId: string | null = null;
  const attemptStart = indexOfLastBookingAttemptStart(messages);

  for (let index = 0; index < messages.length; index += 1) {
    if (index < attemptStart) continue;
    const message = messages[index];
    for (const call of message?.toolCalls ?? []) {
      if (!SCHEDULING_SLOT_TOOL_KEYS.has(call.name)) continue;
      const output = tryParseToolPayloadFromFollowingMessage(messages, index, call.id);
      if (!output) continue;
      const ids = readSchedulingIdsFromToolOutput(call.name, output);
      if (ids) {
        serviceId = ids.serviceId;
        resourceId = ids.resourceId;
      }
    }
  }

  for (const execution of toolExecutions) {
    if (execution.status !== "succeeded") continue;
    if (!SCHEDULING_SLOT_TOOL_KEYS.has(execution.toolKey)) continue;
    const fromInput = readSchedulingIdsFromToolInput(execution.toolKey, execution.input ?? null);
    if (fromInput) {
      serviceId = fromInput.serviceId;
      resourceId = fromInput.resourceId;
    }
    const ids = readSchedulingIdsFromToolOutput(execution.toolKey, execution.output);
    if (ids) {
      serviceId = ids.serviceId;
      resourceId = ids.resourceId;
    }
  }

  return serviceId && resourceId ? { serviceId, resourceId } : null;
}

function tryParseToolPayloadFromFollowingMessage(
  messages: RuntimeGatewayChatRequest["messages"],
  assistantIndex: number,
  toolCallId: string | undefined,
): Record<string, unknown> | null {
  if (!toolCallId) return null;
  for (let index = assistantIndex + 1; index < messages.length; index += 1) {
    const message = messages[index];
    if (message?.role !== "tool") continue;
    if (message.toolCallId && message.toolCallId !== toolCallId) continue;
    if (typeof message.content !== "string") return null;
    try {
      return JSON.parse(message.content) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

function readSchedulingCatalogIds(
  messages: RuntimeGatewayChatRequest["messages"],
  toolExecutions: ToolCallLoopResult["toolExecutions"] = [],
): { serviceId: string; resourceId: string } | null {
  const fromSuccessfulTools = readSchedulingCatalogIdsFromSuccessfulTools(messages, toolExecutions);
  if (fromSuccessfulTools) return fromSuccessfulTools;

  const uuidPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  let serviceId: string | null = null;
  let resourceId: string | null = null;
  const serviceRe = new RegExp(`serviceId[=:\\s]+(${uuidPattern})`, "gi");
  const resourceRe = new RegExp(`resourceId[=:\\s]+(${uuidPattern})`, "gi");
  const attemptStart = indexOfLastBookingAttemptStart(messages);

  for (let index = 0; index < messages.length; index += 1) {
    if (index < attemptStart) continue;
    const message = messages[index];
    const content = typeof message?.content === "string" ? message.content : "";
    const serviceMatches = [...content.matchAll(serviceRe)];
    const resourceMatches = [...content.matchAll(resourceRe)];
    if (serviceMatches.length > 0) {
      serviceId = String(serviceMatches[serviceMatches.length - 1]?.[1]);
    }
    if (resourceMatches.length > 0) {
      resourceId = String(resourceMatches[resourceMatches.length - 1]?.[1]);
    }
  }

  if (!serviceId || !resourceId) {
    const catalogBlob = messages.map((message) => String(message.content ?? "")).join("\n");
    const attemptUserBlob = messages
      .slice(attemptStart)
      .filter((message) => message.role === "user")
      .map((message) => String(message.content ?? ""))
      .join("\n");
    const latestUser = latestUserTextFromMessages(messages);
    const userBlob = attemptUserBlob || latestUser;
    if (!serviceId && /عيادة/i.test(userBlob)) {
      serviceId =
        new RegExp(`-\\s*عيادة\\s*:\\s*serviceId=(${uuidPattern})`, "i").exec(catalogBlob)?.[1] ??
        null;
    }
    if (!serviceId && /اسنان|أسنان/i.test(userBlob)) {
      serviceId =
        new RegExp(`-\\s*اسنان\\s*:\\s*serviceId=(${uuidPattern})`, "i").exec(catalogBlob)?.[1] ??
        null;
    }
    if (!resourceId && /ADAM|آدم|ادم|مع\s*ADAM/i.test(userBlob)) {
      resourceId =
        new RegExp(`-\\s*ADAM\\s*:\\s*resourceId=(${uuidPattern})`, "i").exec(catalogBlob)?.[1] ??
        new RegExp(
          `ADAM[^\\n]*offers[^\\n]*resourceId=(${uuidPattern})`,
          "i",
        ).exec(catalogBlob)?.[1] ??
        null;
    }
    const attemptBlob = messages
      .slice(attemptStart)
      .map((message) => String(message.content ?? ""))
      .join("\n");
    if (!resourceId && /مع\s*ADAM/i.test(attemptBlob)) {
      resourceId =
        new RegExp(`-\\s*ADAM\\s*:\\s*resourceId=(${uuidPattern})`, "i").exec(catalogBlob)?.[1] ??
        new RegExp(
          `ADAM[^\\n]*offers[^\\n]*resourceId=(${uuidPattern})`,
          "i",
        ).exec(catalogBlob)?.[1] ??
        null;
    }
    if (!serviceId && /احجز/.test(userBlob) && /عيادة|clinic/i.test(userBlob)) {
      serviceId =
        new RegExp(`-\\s*[^\\n:]+:\\s*serviceId=(${uuidPattern})`, "i").exec(catalogBlob)?.[1] ??
        new RegExp(`serviceId=(${uuidPattern})`, "i").exec(catalogBlob)?.[1] ??
        null;
    }
    if (serviceId && !resourceId) {
      resourceId =
        new RegExp(
          `serviceId=${serviceId}[^\\n]*resourceId=(${uuidPattern})`,
          "i",
        ).exec(catalogBlob)?.[1] ??
        new RegExp(
          `resourceId=(${uuidPattern})[^\\n]*serviceId=${serviceId}`,
          "i",
        ).exec(catalogBlob)?.[1] ??
        null;
    }
  }

  if (!serviceId || !resourceId) return null;
  return { serviceId, resourceId };
}

function hasSelectedBookingSlotContext(
  messages: RuntimeGatewayChatRequest["messages"],
  toolExecutions: ToolCallLoopResult["toolExecutions"] = [],
): boolean {
  return hasUserSelectedBookingSlot(messages, toolExecutions);
}

function isActiveCreateBookingTurn(
  messages: RuntimeGatewayChatRequest["messages"],
  toolExecutions: ToolCallLoopResult["toolExecutions"] = [],
): boolean {
  if (isNonMutatingFollowUpMessage(latestUserTextFromMessages(messages))) return false;
  if (customerWantsBookingStatusByReference(messages)) return false;
  if (customerWantsCancelBooking(messages)) return false;
  if (customerWantsCheckInOrOut(messages)) return false;
  if (customerWantsRescheduleBooking(messages)) return false;
  if (customerWantsCreateTicket(messages) || customerWantsAnyTicketFlow(messages)) return false;
  if (latestUserExplicitBookingLookup(messages)) return false;

  // Fresh create intent ("حجز" / "عايز احجز") is an active create turn even before a slot
  // is selected — blocks search_bookings/cancel from stealing the conversation.
  if (latestUserWantsCreateBooking(messages)) return true;

  // After availability was shown, slot picks (available or not) stay in create flow.
  if (
    conversationShowsRecentBookingAvailability(messages) &&
    (isSlotPickMessage(latestUserTextFromMessages(messages)) ||
      parseRelativeArabicBookingSlot(latestUserTextFromMessages(messages)) !== null)
  ) {
    return true;
  }

  if (!hasSelectedBookingSlotContext(messages, toolExecutions)) return false;

  const latest = latestUserTextFromMessages(messages);
  const intake = readPatientIntakeFromConversation(messages);
  if (intake?.name?.trim() || intake?.phone?.trim()) return true;
  return (
    looksLikeBookingIntent(latest) ||
    isSlotPickMessage(latest) ||
    /اسم(?:\s*المريض)?\s*[:：]/i.test(latest)
  );
}

function sanitizeCreateCustomerArgs(
  args: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const next = { ...(args ?? {}) };
  delete next.displayName;
  delete next.display_name;
  if (typeof next.name === "string") next.name = next.name.trim();
  if (typeof next.phone === "string") next.phone = next.phone.trim();
  return next;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

/**
 * Replace invented service/resource ids (e.g. service-id-12345) with catalog UUIDs
 * from the conversation prompt / prior real tool calls.
 */
function rewriteAvailabilitySearchDate(
  args: Record<string, unknown>,
  messages: RuntimeGatewayChatRequest["messages"],
): Record<string, unknown> {
  const next = { ...args };
  const today = cairoCalendarYmd(0);
  const relative = parseRelativeArabicBookingSlot(latestUserTextFromMessages(messages));
  if (relative?.date) {
    next.date = relative.date;
    return next;
  }
  const requested = typeof next.date === "string" ? next.date.trim() : "";
  if (requested && requested < today) {
    delete next.date;
  }
  return next;
}

function rewriteSchedulingCatalogArgs(
  args: Record<string, unknown> | undefined,
  messages: RuntimeGatewayChatRequest["messages"],
): Record<string, unknown> {
  const next = { ...(args ?? {}) };
  const serviceId = String(next.serviceId ?? "").trim();
  const resourceId = String(next.resourceId ?? "").trim();
  if (isUuid(serviceId) && (!resourceId || isUuid(resourceId))) {
    return rewriteAvailabilitySearchDate(next, messages);
  }

  const catalogBlob = messages.map((message) => String(message.content ?? "")).join("\n");
  const latestUser = latestUserTextFromMessages(messages);
  const uuidPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

  // Prefer named catalog rows matching the latest user phrasing (عيادة / اسنان / ADAM).
  if (!isUuid(serviceId)) {
    const namedService =
      (/عيادة/i.test(latestUser)
        ? new RegExp(`-\\s*عيادة\\s*:\\s*serviceId=(${uuidPattern})`, "i").exec(catalogBlob)
        : null) ??
      (/اسنان|أسنان/i.test(latestUser)
        ? new RegExp(`-\\s*اسنان\\s*:\\s*serviceId=(${uuidPattern})`, "i").exec(catalogBlob)
        : null) ??
      new RegExp(`serviceId[=:\\s]+(${uuidPattern})`, "i").exec(catalogBlob);
    if (namedService?.[1]) next.serviceId = namedService[1];
  }

  if (resourceId && !isUuid(resourceId)) {
    const namedResource =
      (/ADAM|آدم|ادم/i.test(latestUser + catalogBlob)
        ? new RegExp(`resourceId[=:\\s]+(${uuidPattern})`, "i").exec(catalogBlob)
        : null) ?? null;
    if (namedResource?.[1]) next.resourceId = namedResource[1];
  }

  const catalog = readSchedulingCatalogIds(messages, []);
  if (catalog) {
    if (!isUuid(String(next.serviceId ?? ""))) next.serviceId = catalog.serviceId;
    if (resourceId && !isUuid(String(next.resourceId ?? ""))) next.resourceId = catalog.resourceId;
  }
  return rewriteAvailabilitySearchDate(next, messages);
}

function rewriteCreateBookingCustomerId(
  input: Record<string, unknown>,
  toolExecutions: ToolCallLoopResult["toolExecutions"],
  sourceMessages: RuntimeGatewayChatRequest["messages"] = [],
  trustedCustomerId?: string | null,
): Record<string, unknown> {
  // Phase 2 — trusted conversation.customer_id always wins over LLM customerId.
  if (hasTrustedBookingIdentity(trustedCustomerId)) {
    return { ...input, customerId: trustedCustomerId!.trim() };
  }
  const current = String(input.customerId ?? "").trim();
  if (isCustomerUuid(current)) return input;
  const resolved = readResolvedCustomerId(toolExecutions, sourceMessages);
  if (!resolved) return input;
  return { ...input, customerId: resolved };
}

function rewriteCreateBookingArgs(
  input: Record<string, unknown> | undefined,
  sourceMessages: RuntimeGatewayChatRequest["messages"],
  toolExecutions: ToolCallLoopResult["toolExecutions"],
  trustedCustomerId?: string | null,
): Record<string, unknown> {
  const next = rewriteCreateBookingCustomerId(
    input ?? {},
    toolExecutions,
    sourceMessages,
    trustedCustomerId,
  );
  const canonical = readLastSuccessfulSchedulingSlot(sourceMessages, toolExecutions);
  if (canonical) {
    next.serviceId = canonical.serviceId;
    next.resourceId = canonical.resourceId;
    next.date = canonical.date;
    next.slotStart = canonical.slotStart;
    return next;
  }

  const userSlot = parseSelectedBookingSlot(sourceMessages, toolExecutions);
  if (userSlot) {
    next.date = userSlot.date;
    next.slotStart = userSlot.slotStart;
  }

  const catalog = readSchedulingCatalogIds(sourceMessages, toolExecutions);
  if (catalog) {
    if (!isUuid(String(next.serviceId ?? ""))) next.serviceId = catalog.serviceId;
    if (!isUuid(String(next.resourceId ?? ""))) next.resourceId = catalog.resourceId;
  }

  return next;
}

function rewriteCreateCustomerArgs(
  args: Record<string, unknown> | undefined,
  sourceMessages: RuntimeGatewayChatRequest["messages"],
): Record<string, unknown> {
  const next = sanitizeCreateCustomerArgs(args);
  const intake = readPatientIntakeFromConversation(sourceMessages);
  const llmName = String(next.name ?? "").trim();
  if (intake?.name?.trim()) {
    if (!llmName || isSchedulingCatalogServiceName(llmName, sourceMessages)) {
      next.name = intake.name;
    }
  }
  return next;
}

function hasSuccessfulCreateBooking(toolExecutions: ToolCallLoopResult["toolExecutions"]): boolean {
  return toolExecutions.some(
    (execution) =>
      execution.toolKey === "create_booking" &&
      execution.status === "succeeded" &&
      execution.output?.success === true &&
      typeof execution.output.bookingId === "string" &&
      Boolean(String(execution.output.bookingId).trim()),
  );
}

function readSuccessfulCreateTicket(
  toolExecutions: ToolCallLoopResult["toolExecutions"],
): ToolCallLoopResult["toolExecutions"][number] | null {
  return (
    [...toolExecutions]
      .reverse()
      .find(
        (execution) =>
          execution.toolKey === "create_ticket" &&
          execution.status === "succeeded" &&
          execution.output?.success === true &&
          typeof execution.output.ticketNumber === "string" &&
          Boolean(String(execution.output.ticketNumber).trim()),
      ) ?? null
  );
}

function hasSuccessfulCreateTicket(toolExecutions: ToolCallLoopResult["toolExecutions"]): boolean {
  return Boolean(readSuccessfulCreateTicket(toolExecutions));
}

function readSuccessfulSearchTicket(
  toolExecutions: ToolCallLoopResult["toolExecutions"],
): ToolCallLoopResult["toolExecutions"][number] | null {
  return (
    [...toolExecutions]
      .reverse()
      .find(
        (execution) =>
          execution.toolKey === "search_ticket" &&
          execution.status === "succeeded" &&
          execution.output?.success === true,
      ) ?? null
  );
}

function hasSuccessfulSearchTicket(toolExecutions: ToolCallLoopResult["toolExecutions"]): boolean {
  return Boolean(readSuccessfulSearchTicket(toolExecutions));
}

function customerWantsCreateTicket(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  const latest = latestUserTextFromMessages(messages);
  return /(?:عايز|أ?فتح|create|open|file).{0,40}(?:شكو|تذكر|complaint|ticket)/i.test(latest);
}

const TICKET_TOOL_KEYS = new Set([
  "search_ticket",
  "create_ticket",
  "add_ticket_comment",
  "assign_ticket",
  "change_ticket_priority",
  "change_ticket_status",
  "update_ticket",
  "close_ticket",
]);

/**
 * Booking phrases must never open a ticket. Explicit ticket/complaint on the
 * latest turn still wins so "عايز أفتح شكوى" keeps working.
 */
function shouldDenyTicketToolsDuringBookingIntent(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  if (customerWantsCreateTicket(messages)) return false;
  if (customerWantsTicketMutation(messages) && !latestUserWantsCreateBooking(messages)) return false;
  if (
    (customerWantsTicketStatus(messages) || customerWantsTicketList(messages)) &&
    !latestUserWantsCreateBooking(messages) &&
    !isFreshCreateBookingStartWithoutSlot(messages)
  ) {
    return false;
  }
  return (
    latestUserWantsCreateBooking(messages) ||
    isFreshCreateBookingStartWithoutSlot(messages) ||
    parseRelativeArabicBookingSlot(latestUserTextFromMessages(messages)) !== null
  );
}

function customerWantsCloseTicket(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  const latest = latestUserTextFromMessages(messages);
  return (
    /اقفلها|اغلقها|اقفل(?:ي|وا)?ها|اغلق(?:ي|وا)?ها/i.test(latest) ||
    /(?:اقفل|اغلق|close).{0,40}(?:TKT-|تذك|شكو)/i.test(latest)
  );
}

function customerWantsAnyTicketFlow(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  return (
    customerWantsTicketList(messages) ||
    customerWantsTicketStatus(messages) ||
    customerWantsTicketMutation(messages) ||
    customerWantsCreateTicket(messages)
  );
}

/** True when the LATEST user turn is clearly booking-related (topic switch away from tickets). */
function latestUserWantsBookingTopic(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  const latest = latestUserTextFromMessages(messages);
  if (!latest) return false;
  if (customerWantsTicketMutation(messages) || customerWantsCreateTicket(messages)) return false;
  if (/^TKT-\d+$/i.test(latest.trim())) return false;
  return (
    looksLikeBookingIntent(latest) ||
    customerWantsCancelBooking(messages) ||
    /أقرب\s*موعد|find_next|next\s*available|search_availability/i.test(latest)
  );
}

function customerWantsTicketMutation(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  const latest = latestUserTextFromMessages(messages);
  return (
    customerWantsCloseTicket(messages) ||
    /(?:حدّ?ث|update).{0,40}(?:TKT-|(?:عنوان|موضوع|وصف|تفاصيل)\s*(?:ال)?(?:تذك|شكو))/i.test(latest) ||
    /(?:ضيف|أضف|add).{0,40}(?:comment|تعليق)/i.test(latest) ||
    /(?:عيّ?ن|assign).{0,30}(?:TKT-|تذك|موظف)/i.test(latest) ||
    /(?:أ?ولوية|priority).{0,40}(?:TKT-|تذك|عالية|منخفضة|عاجلة|high|low|urgent)/i.test(latest) ||
    /(?:غيّ?ر|change).{0,20}(?:ال)?(?:حالة|status|حالتها)/i.test(latest) ||
    /(?:حالة|status).{0,30}(?:TKT-|قيد\s*المعالجة|in_progress|مفتوحة|مغلقة)/i.test(latest)
  );
}

function customerWantsTicketList(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  const recentUserText = messages
    .filter((message) => message.role === "user")
    .slice(-6)
    .map((message) => String(message.content ?? ""))
    .join("\n");
  return /(?:عايز|وريني|اعرض|show).{0,24}(?:التذاكر|تذاكر(?:ي|ك|نا)?|شكاو(?:ي|ى)?)|my tickets|show me my tickets/i.test(
    recentUserText,
  );
}

function customerWantsTicketStatus(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  const recentUserText = messages
    .filter((message) => message.role === "user")
    .slice(-6)
    .map((message) => String(message.content ?? ""))
    .join("\n");
  return /تتبع|اتتبع|حالة\s*(?:ال)?شكو|حالة\s*(?:ال)?تذكر|ابحث\s*(?:عن\s*)?(?:حالة\s*)?(?:ال)?(?:شكو|تذكر)|رقم\s*(?:ال)?(?:تذكر|شكو)|فين\s*(?:ال)?شكو|ايش\s*صار.*(?:شكو|تذكر)|اعرف\s*(?:حالة\s*)?(?:ال)?شكو|ticket\s*(?:status|number)|track\s*(?:my\s*)?(?:ticket|complaint)|status\s*(?:of\s*)?(?:ticket|complaint)/i.test(
    recentUserText,
  );
}

function readTicketNumberFromMessages(
  messages: RuntimeGatewayChatRequest["messages"],
): string | null {
  const userMessages = messages
    .filter((message) => message.role === "user")
    .slice(-6)
    .map((message) => String(message.content ?? ""));

  // Prefer the latest user message so older ticket numbers in history are ignored.
  for (let index = userMessages.length - 1; index >= 0; index -= 1) {
    const text = userMessages[index] ?? "";
    const withPrefix = text.match(/TKT-\d+/gi);
    if (withPrefix && withPrefix.length > 0) {
      return withPrefix[withPrefix.length - 1]!.toUpperCase();
    }
    const bare = text.match(/(?:^|\s)(\d{5,8})(?:\s|$)/);
    if (bare?.[1]) return `TKT-${bare[1]}`;
  }
  return null;
}

function isFalseTicketSearchDenial(text: string): boolean {
  return /(?:ليس لدي|لا أستطيع|لا استطيع|لا يمكنني|آسف|للاسف|للأسف).{0,60}(?:بحث|تتبع|البحث).{0,60}(?:شكو|تذكر)|cannot\s+(?:search|track).{0,30}(?:ticket|complaint)/i.test(
    text.trim(),
  );
}

const ASK_TICKET_NUMBER_REPLY =
  "تمام، ابعتيلي رقم الشكوى (مثال: TKT-000085) وأقولك حالتها وتفاصيلها.";

function ticketStatusLabel(statusRaw: string): string {
  if (statusRaw === "in_progress") return "قيد المعالجة";
  if (statusRaw === "waiting_customer") return "بانتظار ردك";
  if (statusRaw === "resolved") return "تم الحل";
  if (statusRaw === "closed") return "مغلقة";
  return "مفتوحة";
}

function ticketPriorityLabel(priorityRaw: string): string {
  if (priorityRaw === "urgent") return "عاجلة";
  if (priorityRaw === "high") return "مرتفعة";
  if (priorityRaw === "low") return "منخفضة";
  return "عادية";
}

function formatTicketCreatedAt(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = date.getUTCFullYear();
  return `${day}-${month}-${year}`;
}

function readSearchTicketStatusReply(output: Record<string, unknown> | null): string | null {
  if (!output || output.success !== true) return null;
  if (output.needsTicketNumber === true) {
    return ASK_TICKET_NUMBER_REPLY;
  }

  const matchedTicketNumber =
    typeof output.matchedTicketNumber === "string" ? output.matchedTicketNumber.trim() : "";
  const tickets = Array.isArray(output.tickets) ? output.tickets : [];

  const total =
    typeof output.total === "number" && Number.isFinite(output.total) ? output.total : tickets.length;
  if (!matchedTicketNumber && (tickets.length > 1 || total > 1)) {
    const lines = tickets
      .map((ticket) => {
        if (!ticket || typeof ticket !== "object") return null;
        const number =
          typeof (ticket as { ticketNumber?: unknown }).ticketNumber === "string"
            ? String((ticket as { ticketNumber: string }).ticketNumber).trim()
            : "";
        const statusRaw =
          typeof (ticket as { status?: unknown }).status === "string"
            ? String((ticket as { status: string }).status)
            : "open";
        if (!number) return null;
        return `${number}: ${ticketStatusLabel(statusRaw)}`;
      })
      .filter(Boolean);
    if (lines.length > 0) {
      return ["تذاكرك المفتوحة:", ...lines].join("\n");
    }
  }

  const latest =
    tickets.find((ticket) => {
      if (!ticket || typeof ticket !== "object") return false;
      const number = (ticket as { ticketNumber?: unknown }).ticketNumber;
      return typeof number === "string" && number.trim() === matchedTicketNumber;
    }) ??
    (tickets.length === 1 ? tickets[0] : null);

  const ticketNumber =
    matchedTicketNumber ||
    (latest && typeof (latest as { ticketNumber?: unknown }).ticketNumber === "string"
      ? String((latest as { ticketNumber: string }).ticketNumber).trim()
      : "");
  if (!ticketNumber) {
    return "مفيش شكوى بالرقم ده مسجّلة على حسابك. اتأكدي من الرقم وابعته تاني.";
  }

  const statusRaw =
    (typeof output.status === "string" && output.status.trim()
      ? output.status.trim()
      : null) ??
    (latest && typeof (latest as { status?: unknown }).status === "string"
      ? String((latest as { status: string }).status)
      : "open");
  const priorityRaw =
    (typeof output.priority === "string" && output.priority.trim()
      ? output.priority.trim()
      : null) ??
    (latest && typeof (latest as { priority?: unknown }).priority === "string"
      ? String((latest as { priority: string }).priority)
      : "normal");
  const createdAt = formatTicketCreatedAt(
    output.createdAt ??
      (latest && typeof latest === "object" ? (latest as { createdAt?: unknown }).createdAt : null),
  );

  return [
    `رقم الشكوى: ${ticketNumber}`,
    `الحالة: ${ticketStatusLabel(statusRaw)}`,
    `الأولوية: ${ticketPriorityLabel(priorityRaw)}`,
    createdAt ? `تاريخ الفتح: ${createdAt}` : null,
    "هنتابع معاكِ أول ما يكون في تحديث.",
  ]
    .filter(Boolean)
    .join("\n");
}

function applyTicketSearchReplyFallback(
  response: RuntimeGatewayChatResponse,
  toolExecutions: ToolCallLoopResult["toolExecutions"],
): RuntimeGatewayChatResponse {
  const lastSearch = readSuccessfulSearchTicket(toolExecutions);
  if (!lastSearch) return response;
  const statusReply = readSearchTicketStatusReply(lastSearch.output ?? null);
  if (!statusReply) return response;

  // Always trust tool status — the model often invents closed/open incorrectly.
  return {
    ...response,
    text: statusReply,
    finishReason: response.finishReason ?? "stop",
  };
}

function applyAskTicketNumberFallback(
  response: RuntimeGatewayChatResponse,
  messages: RuntimeGatewayChatRequest["messages"],
  toolExecutions: ToolCallLoopResult["toolExecutions"],
): RuntimeGatewayChatResponse {
  if (hasSuccessfulSearchTicket(toolExecutions)) {
    const lastSearch = readSuccessfulSearchTicket(toolExecutions);
    if (lastSearch?.output?.needsTicketNumber !== true) return response;
  }
  if (
    !customerWantsTicketStatus(messages) &&
    !isFalseTicketSearchDenial(response.text ?? "")
  ) {
    return response;
  }
  if (readTicketNumberFromMessages(messages)) return response;

  const text = response.text.trim();
  if (
    text.includes(ASK_TICKET_NUMBER_REPLY) ||
    (/رقم\s*(?:ال)?(?:شكو|تذكر)/i.test(text) && /ابعث|ابعت|قول|اكتبي|اكتبيلي/i.test(text))
  ) {
    return response;
  }

  return {
    ...response,
    text: ASK_TICKET_NUMBER_REPLY,
    finishReason: response.finishReason ?? "stop",
  };
}

async function forceSearchTicketIfNeeded(input: {
  tools: RuntimeToolPort;
  ctx: ServiceContext;
  conversationId: string;
  allowedToolKeys: string[];
  sourceMessages: RuntimeGatewayChatRequest["messages"];
  toolExecutions: ToolCallLoopResult["toolExecutions"];
  responseText?: string;
}): Promise<void> {
  const allowed = new Set([
    ...input.allowedToolKeys,
    ...(typeof input.tools.allowedToolKeys === "function" ? input.tools.allowedToolKeys() : []),
  ]);
  if (!allowed.has("search_ticket")) return;

  const ticketNumber = readTicketNumberFromMessages(input.sourceMessages);
  const latestUserText = String(
    [...input.sourceMessages].reverse().find((message) => message.role === "user")?.content ?? "",
  ).trim();
  const latestIsTicketNumber = /^TKT-\d+$/i.test(latestUserText) || /^\d{5,8}$/.test(latestUserText);
  const wantsTicketList = customerWantsTicketList(input.sourceMessages) && !ticketNumber;
  const ticketSearches = input.toolExecutions.filter((execution) => execution.toolKey === "search_ticket");

  if (wantsTicketList) {
    const listSearch = ticketSearches.find(
      (execution) =>
        execution.status === "succeeded" &&
        execution.output?.success === true &&
        execution.output?.matchedTicketNumber == null &&
        typeof execution.output?.total === "number" &&
        execution.output.total > 1,
    );
    if (listSearch) return;
    if (ticketSearches.length >= 2) return;

    const routed = await input.tools.route(input.ctx, {
      conversationId: input.conversationId,
      toolKey: "search_ticket",
      input: { limit: 20 },
      triggeredBy: "agent",
    });
    input.toolExecutions.push({
      toolKey: routed.toolKey,
      executionId: routed.executionId,
      status: routed.status,
      output: routed.output,
      durationMs: routed.durationMs,
    });
    return;
  }

  if (ticketSearches.length > 0) return;
  if (hasSuccessfulSearchTicket(input.toolExecutions)) return;

  if (
    !ticketNumber &&
    !isFalseTicketSearchDenial(input.responseText ?? "")
  ) {
    return;
  }
  if (
    ticketNumber &&
    !customerWantsTicketStatus(input.sourceMessages) &&
    !isFalseTicketSearchDenial(input.responseText ?? "") &&
    !latestIsTicketNumber
  ) {
    return;
  }

  const routed = await input.tools.route(input.ctx, {
    conversationId: input.conversationId,
    toolKey: "search_ticket",
    input: ticketNumber ? { query: ticketNumber, limit: 5 } : { limit: 20 },
    triggeredBy: "agent",
  });
  input.toolExecutions.push({
    toolKey: routed.toolKey,
    executionId: routed.executionId,
    status: routed.status,
    output: routed.output,
    durationMs: routed.durationMs,
  });
}

function latestUserTextFromMessages(
  messages: RuntimeGatewayChatRequest["messages"],
): string {
  const raw = String(
    [...messages].reverse().find((message) => message.role === "user")?.content ?? "",
  ).trim();
  return raw.replace(/^(?:e2e-(?:rt|ci|wa)-\S+\s+|idem-\S+\s+)/i, "").trim();
}

function customerWantsCheckInOrOut(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  const latest = latestUserTextFromMessages(messages);
  // Cancel / reschedule / new-book on the latest turn supersede lingering attendance intent.
  // Without this, forceCheckInOutIfReady steals BK refs from "ألغي BK-…" after a prior check-in.
  if (/(?:الغي|ألغي|الغى|الغاء|إلغاء|cancel)/i.test(latest)) return false;
  if (customerWantsRescheduleFromText(latest)) return false;
  if (latestUserWantsCreateBooking(messages)) return false;
  if (customerWantsCreateTicket(messages) || customerWantsAnyTicketFlow(messages)) return false;

  // Scan recent user turns — phone-only follow-ups must keep check-in/out intent.
  for (const message of [...messages].reverse().slice(0, 8)) {
    if (message.role !== "user") continue;
    const text = String(message.content ?? "");
    if (
      /تسجيل\s*حضور|تسجيل\s*انصراف|check[_\s-]?in|check[_\s-]?out|سجل حضور|اسجل حضور|أسجل حضور|انصرافي|أسجل انصراف/i.test(
        text,
      )
    ) {
      return true;
    }
  }
  return false;
}

function customerWantsRecommendationOrAvailability(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  const latest = latestUserTextFromMessages(messages);
  if (customerWantsFindNextAvailableFromText(latest)) return true;
  return /موعد متاح|المواعيد المتاحة|اقترح|أنسب ميعاد|recommend|search_availability|availability/i.test(
    latest,
  );
}

/**
 * "Nearest / earliest appointment" must use find_next_available, not a multi-day
 * search_availability list. Dated "what's open on DD-MM" stays search_availability.
 */
function customerWantsFindNextAvailableFromText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (customerWantsRescheduleFromText(trimmed)) return false;
  if (/(?:الغي|ألغي|الغى|الغاء|إلغاء|cancel)/i.test(trimmed)) return false;
  // Explicit date-list / day availability → search_availability, not find-next.
  const hasConcreteDate =
    /\b(20\d{2}-\d{2}-\d{2})\b/.test(trimmed) || /\b\d{2}-\d{2}-(20\d{2})\b/.test(trimmed);
  if (hasConcreteDate && /متاح|availability|مواعيد|slots?/i.test(trimmed) && !/أقرب|earliest|find[_ ]?next/i.test(trimmed)) {
    return false;
  }
  if (/المواعيد المتاحة|available\s+(?:times|slots)|what(?:'s| is)?\s+available\s+on/i.test(trimmed)) {
    if (!/أقرب|earliest|find[_ ]?next|next\s+available/i.test(trimmed)) return false;
  }
  return /(?:أقرب\s*موعد|أقرب\s*ميعاد|أول\s*موعد|ايه أقرب|إيه أقرب|earliest(?:\s+available)?|next\s+available|find[_ ]?next(?:_available)?)/i.test(
    trimmed,
  );
}

function customerWantsFindNextAvailable(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  return customerWantsFindNextAvailableFromText(latestUserTextFromMessages(messages));
}

function readSchedulingServiceId(
  messages: RuntimeGatewayChatRequest["messages"],
): string | null {
  const both = readSchedulingCatalogIds(messages, []);
  if (both?.serviceId) return both.serviceId;

  const uuidPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  const catalogBlob = messages.map((message) => String(message.content ?? "")).join("\n");
  const latestUser = latestUserTextFromMessages(messages);

  if (/عيادة/i.test(latestUser) || /أقرب|earliest|find[_ ]?next/i.test(latestUser)) {
    const fromClinic =
      new RegExp(`-\\s*عيادة\\s*:\\s*serviceId=(${uuidPattern})`, "i").exec(catalogBlob)?.[1] ??
      null;
    if (fromClinic) return fromClinic;
  }
  if (/اسنان|أسنان/i.test(latestUser)) {
    const fromDental =
      new RegExp(`-\\s*اسنان\\s*:\\s*serviceId=(${uuidPattern})`, "i").exec(catalogBlob)?.[1] ??
      null;
    if (fromDental) return fromDental;
  }
  const firstService =
    new RegExp(`serviceId=(${uuidPattern})`, "i").exec(catalogBlob)?.[1] ?? null;
  return firstService;
}

function hasSuccessfulFindNextAvailable(
  toolExecutions: ToolCallLoopResult["toolExecutions"],
): boolean {
  return toolExecutions.some(
    (execution) =>
      execution.toolKey === "find_next_available" &&
      execution.status === "succeeded" &&
      execution.output?.success === true,
  );
}

function formatFindNextFacing(output: Record<string, unknown> | null): string | null {
  if (!output) return null;
  if (typeof output.customerFacingMessage === "string" && output.customerFacingMessage.trim()) {
    return output.customerFacingMessage.trim();
  }
  const slot = output.slot;
  if (slot && typeof slot === "object") {
    const date = typeof (slot as { date?: unknown }).date === "string" ? (slot as { date: string }).date : "";
    const start =
      typeof (slot as { start?: unknown }).start === "string" ? (slot as { start: string }).start : "";
    const resourceName =
      typeof (slot as { resourceName?: unknown }).resourceName === "string"
        ? (slot as { resourceName: string }).resourceName
        : "";
    if (date && start) {
      return `أقرب موعد متاح: يوم ${date} الساعة ${start}${resourceName ? ` مع ${resourceName}` : ""}.`;
    }
  }
  if (typeof output.message === "string" && output.message.trim()) return output.message.trim();
  return null;
}

/** User explicitly wants another nearest slot (do not suppress duplicate-facing guard). */
function customerWantsAnotherFindNext(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  const latest = latestUserTextFromMessages(messages).trim();
  if (!latest) return false;
  return /(?:أقرب|اقرب|earliest|next\s+available).{0,24}(?:تاني|ثاني|غيره|أخرى|اخرى|آخر|اخر|again|another)/i.test(
    latest,
  );
}

function applyFindNextAvailableReplyFallback(
  response: RuntimeGatewayChatResponse,
  toolExecutions: ToolCallLoopResult["toolExecutions"],
  messages: RuntimeGatewayChatRequest["messages"] = [],
): RuntimeGatewayChatResponse {
  const last = [...toolExecutions]
    .reverse()
    .find((execution) => execution.toolKey === "find_next_available");
  if (!last) return response;
  const facing = formatFindNextFacing(last.output ?? null);
  if (!facing) return response;

  const alreadyShown = messages.some(
    (message) =>
      message.role === "assistant" &&
      typeof message.content === "string" &&
      message.content.includes(facing),
  );
  const wantsAnother = customerWantsAnotherFindNext(messages);
  // Slot-selection / identity turns must not re-emit the same availability line.
  if (
    alreadyShown &&
    !wantsAnother &&
    (hasUserSelectedBookingSlot(messages) ||
      latestUserWantsCreateBooking(messages) ||
      Boolean(readPatientIntakeFromConversation(messages)?.phone) ||
      Boolean(readPatientIntakeFromConversation(messages)?.name))
  ) {
    return response;
  }
  if (alreadyShown && !wantsAnother && !response.text.trim()) {
    // Same find_next result already delivered — do not duplicate the bubble.
    return response;
  }

  if (last.status === "succeeded" && last.output?.success === true) {
    if (alreadyShown && !wantsAnother && response.text.trim() && response.text.includes(facing)) {
      return response;
    }
    return { ...response, text: facing, finishReason: response.finishReason ?? "stop" };
  }
  if (!response.text.trim() || /جارٍ التفكير|أعتذر|مشكلة|اسم المريض/i.test(response.text)) {
    if (alreadyShown && !wantsAnother) return response;
    return { ...response, text: facing, finishReason: response.finishReason ?? "stop" };
  }
  return response;
}

/**
 * Nearest-appointment intent must call find_next_available (one earliest slot),
 * not drift into a multi-day search_availability list.
 */
async function forceFindNextAvailableIfReady(input: {
  tools: RuntimeToolPort;
  ctx: ServiceContext;
  conversationId: string;
  allowedToolKeys: string[];
  sourceMessages: RuntimeGatewayChatRequest["messages"];
  toolExecutions: ToolCallLoopResult["toolExecutions"];
}): Promise<void> {
  if (!customerWantsFindNextAvailable(input.sourceMessages)) return;
  if (hasSuccessfulFindNextAvailable(input.toolExecutions)) return;
  if (
    input.toolExecutions.some(
      (execution) =>
        execution.toolKey === "find_next_available" && execution.status !== "denied",
    )
  ) {
    return;
  }

  const allowed = new Set([
    ...input.allowedToolKeys,
    ...(typeof input.tools.allowedToolKeys === "function" ? input.tools.allowedToolKeys() : []),
  ]);
  if (!allowed.has("find_next_available")) return;

  const serviceId = readSchedulingServiceId(input.sourceMessages);
  if (!serviceId) {
    input.toolExecutions.push({
      toolKey: "find_next_available",
      executionId: `forced-find-next-guidance-${Date.now()}`,
      status: "failed",
      output: {
        success: false,
        errors: ["SERVICE_CONTEXT_REQUIRED"],
        customerFacingMessage: "قوليلي الخدمة (مثل عيادة) عشان أجيب أقرب موعد متاح.",
      },
      durationMs: 0,
    });
    return;
  }

  const catalog = readSchedulingCatalogIds(input.sourceMessages, input.toolExecutions);
  try {
    const routed = await input.tools.route(input.ctx, {
      conversationId: input.conversationId,
      toolKey: "find_next_available",
      input: {
        serviceId,
        ...(catalog?.resourceId ? { resourceId: catalog.resourceId } : {}),
      },
      triggeredBy: "agent",
    });
    input.toolExecutions.push({
      toolKey: routed.toolKey,
      executionId: routed.executionId,
      status: routed.status,
      output: routed.output,
      durationMs: routed.durationMs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "find_next_available failed.";
    input.toolExecutions.push({
      toolKey: "find_next_available",
      executionId: `forced-find-next-error-${Date.now()}`,
      status: "failed",
      output: {
        success: false,
        errors: ["FIND_NEXT_FORCE_FAILED"],
        message,
        customerFacingMessage: "ما قدرناش نجيب أقرب موعد دلوقتي. جرّبي تاني بعد لحظات.",
      },
      durationMs: 0,
    });
  }
}

async function forceSearchAvailabilityIfReady(input: {
  tools: RuntimeToolPort;
  ctx: ServiceContext;
  conversationId: string;
  allowedToolKeys: string[];
  sourceMessages: RuntimeGatewayChatRequest["messages"];
  toolExecutions: ToolCallLoopResult["toolExecutions"];
}): Promise<void> {
  if (customerWantsCancelBooking(input.sourceMessages)) return;
  if (customerWantsFindNextAvailable(input.sourceMessages)) return;
  if (hasSuccessfulCreateBooking(input.toolExecutions)) return;
  if (lastUsableAvailability(input.toolExecutions)) return;

  const latest = latestUserTextFromMessages(input.sourceMessages);
  const relative = parseRelativeArabicBookingSlot(latest);
  const freshStart = isFreshCreateBookingStartWithoutSlot(input.sourceMessages);
  if (!freshStart && !relative) return;

  if (
    input.toolExecutions.some(
      (execution) =>
        execution.toolKey === "search_availability" && execution.status !== "denied",
    )
  ) {
    return;
  }

  const allowed = new Set([
    ...input.allowedToolKeys,
    ...(typeof input.tools.allowedToolKeys === "function" ? input.tools.allowedToolKeys() : []),
  ]);
  if (!allowed.has("search_availability")) return;

  const serviceId = readSchedulingServiceId(input.sourceMessages);
  if (!serviceId) return;
  const catalog = readSchedulingCatalogIds(input.sourceMessages, input.toolExecutions);

  try {
    const routed = await input.tools.route(input.ctx, {
      conversationId: input.conversationId,
      toolKey: "search_availability",
      input: {
        serviceId,
        ...(catalog?.resourceId ? { resourceId: catalog.resourceId } : {}),
        ...(relative?.date ? { date: relative.date } : {}),
      },
      triggeredBy: "agent",
    });
    input.toolExecutions.push({
      toolKey: routed.toolKey,
      executionId: routed.executionId,
      status: routed.status,
      output: routed.output,
      durationMs: routed.durationMs,
    });
  } catch {
    // Reply fallbacks handle an empty availability result.
  }
}

/** Topic change: newest user turn is clearly not continuing cancel selection. */
function latestUserSwitchedAwayFromCancel(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (customerWantsRescheduleFromText(trimmed)) return true;
  if (isCancelSelectionMessage(trimmed)) return false;
  if (/(?:الغي|ألغي|الغى|الغاء|إلغاء|cancel)/i.test(trimmed)) return false;
  if (/^\+?\d[\d\s-]{7,}$/.test(trimmed.replace(/\s/g, ""))) return false;
  if (isSlotPickMessage(trimmed) || looksLikeBookingIntent(trimmed)) return true;
  if (/اسم(?:\s*المريض)?\s*[:：]/i.test(trimmed) && extractPhoneFromText(trimmed)) return true;
  return /(?:أقرب موعد|موعد متاح|المواعيد المتاحة|availability|find[_ ]?next|recommend|اقترح|أنسب ميعاد|عايز أحجز|عايزة أحجز|عايز حجز|عايزة حجز|محتاج احجز|محتاجة احجز|احجز|حجز(?:\s+جديد)?|^حجز$|search_availability|check[_\s-]?in|check[_\s-]?out|تسجيل حضور|تسجيل انصراف|أسجل حضور|أسجل انصراف|حجوزاتي|اعرف حجوز|what bookings)/i.test(
    trimmed,
  );
}

function customerWantsRescheduleFromText(text: string): boolean {
  return /(?:أغير|اغير|تغيير|تغير|عدّل|عدل|تأجيل|تاجيل|إعادة\s*جدولة|اعادة\s*جدولة|reschedule|change\s+(?:the\s+)?(?:appointment|booking|time|slot)|غير(?:ي)?\s+(?:ميعاد|موعد|الحجز)|أغير\s+ميعاد|عايز(?:ة)?\s+(?:أغير|اغير|أأجل|ااجل|أعدل|اعدل)|غيّر(?:ي)?\s+(?:الميعاد|الموعد|الحجز))/i.test(
    text,
  );
}

function customerWantsRescheduleBooking(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  return customerWantsRescheduleFromText(latestUserTextFromMessages(messages));
}

function customerWantsCancelBooking(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  const latestUserText = latestUserTextFromMessages(messages);
  // Case D: after cancel list/selection, a new non-cancel topic must not inherit cancel purpose.
  if (latestUserSwitchedAwayFromCancel(latestUserText)) return false;
  // Reschedule must never inherit cancel purpose (BK + new time looks like cancel selection).
  if (customerWantsRescheduleBooking(messages)) return false;
  // Ticket close/update must not inherit booking cancel purpose.
  if (customerWantsTicketMutation(messages)) return false;
  if (customerWantsCheckInOrOut(messages)) return false;

  // Bare Arabic cancel confirmation always wins over stale create-booking slot context
  // (e.g. prior "الثلاثاء 08:30" in the same conversation after BK-000045 was created).
  if (isBareCancelConfirmationText(latestUserText)) return true;
  // نعم/ايوه only continue cancel when an assistant cancel-list was offered.
  if (isBareAffirmativeConfirmationText(latestUserText) && assistantOfferedCancelList(messages)) {
    return true;
  }
  if (customerWantsCancelLastBookingFromText(latestUserText)) return true;

  // Active create-booking slot/intake must never inherit cancel purpose.
  if (parseSelectedBookingSlot(messages)) return false;
  if (
    /اسم(?:\s*المريض)?\s*[:：]/i.test(latestUserText) &&
    Boolean(extractPhoneFromText(latestUserText))
  ) {
    return false;
  }

  // Only user/assistant turns — system/tool prompts often contain the English word "cancel".
  const recentText = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-16)
    .map((message) => String(message.content ?? ""))
    .join("\n");
  return (
    /(?:الغي|ألغي|الغى|الغاء|إلغاء|الالغاء|cancel(?:\s+(?:the\s+)?(?:booking|appointment))?|عايز(?:ة)?\s*(?:الغي|ألغي|الغى))/i.test(
      recentText,
    ) ||
    /أنهي موعد تلغي|موعد ممكن إلغاؤه|مش هألغي غير بعد ما تختاري|رقم الحجز:\s*BK-/i.test(recentText)
  );
}

function conversationAwaitingCancelSelection(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  if (!customerWantsCancelBooking(messages)) return false;
  const recentAssistant = messages
    .filter((message) => message.role === "assistant")
    .slice(-8)
    .map((message) => String(message.content ?? ""));
  // Require cancel-list cues — booking confirmation ("رقم الحجز: BK-…") alone is not enough.
  return recentAssistant.some(
    (text) =>
      /\bBK-\d+\b/i.test(text) &&
      /أنهي موعد|ممكن إلغاؤه|موعد تلغي|ده الموعد الوحيد|قولّي\s*"?ألغي|قولي\s*"?ألغي|اختار(?:ي)?\s*(?:موعد|رقم)|which appointment|select.*(?:cancel|booking)/i.test(
        text,
      ),
  );
}

function conversationOfferedCancelReference(
  messages: RuntimeGatewayChatRequest["messages"],
  bookingReference: string,
): boolean {
  const wanted = bookingReference.trim().toUpperCase();
  if (!wanted) return false;
  const recentAssistant = messages
    .filter((message) => message.role === "assistant")
    .slice(-8)
    .map((message) => String(message.content ?? ""));
  return recentAssistant.some((text) => {
    const upper = text.toUpperCase();
    if (!upper.includes(wanted)) return false;
    // Arabic cancel-list cues OR English/selection cues OR active cancel flow.
    return (
      /أنهي موعد|ممكن إلغاؤه|رقم الحجز|ألغي|الغاء|إلغاء|اختار|اختاري|قولّي|قولي|cancel|booking|appointment|reference|select|which/i.test(
        text,
      ) || customerWantsCancelBooking(messages)
    );
  });
}

function customerWantsBookingLookup(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  if (customerWantsCancelBooking(messages)) return true;
  // Create-booking confirmation must not inherit old-booking lookup (LIVE Phase 2 failure).
  if (latestUserWantsCreateBooking(messages)) return false;
  if (latestUserExplicitBookingLookup(messages)) return true;
  const recentText = messages
    .slice(-8)
    .map((message) => String(message.content ?? ""))
    .join("\n");
  return /حجوزاتي|حجوز(?:ات)?|مواعيدى|مواعيدي|ابحث.*(?:حجز|موعد)|شوف.*(?:حجز|موعد)|عايز(?:ة)?\s*(?:اعرف|اشوف).*(?:حجز|موعد)|what\s+bookings|my\s+appointments/i.test(
    recentText,
  );
}

function readValidatedPhoneForBookingSearch(value: string): string | null {
  const validated = validateEgyptMobilePhone(value);
  return validated.valid ? validated.normalized : null;
}

function readPhoneForBookingSearch(
  messages: RuntimeGatewayChatRequest["messages"],
): string | null {
  const userMessages = messages
    .filter((message) => message.role === "user")
    .slice(-20)
    .map((message) => String(message.content ?? "").trim());

  for (let index = userMessages.length - 1; index >= 0; index -= 1) {
    const text = userMessages[index] ?? "";
    if (/^TKT-\d+$/i.test(text)) continue;
    const fromExtractor = extractPhoneFromText(text);
    if (fromExtractor) return fromExtractor;

    const hasBk = /\bBK-\d+\b/i.test(text);
    const hasPhoneCue = /(?:موبايل|هاتف|رقم|phone|mobile|ورقمي)/i.test(text);
    const digitRuns = text.match(/(?:\+?\d[\d\s\-()]{7,14}\d)/g) ?? [];
    const phoneFromRun = digitRuns
      .map((run) => run.replace(/\D/g, ""))
      .map((digits) => readValidatedPhoneForBookingSearch(digits))
      .find((phone): phone is string => Boolean(phone));
    if (hasBk && !hasPhoneCue && !phoneFromRun) continue;
    if (phoneFromRun) return phoneFromRun;
    const digits = convertArabicDigitsToAscii(text).replace(/\D/g, "");
    if (
      digits.length >= 10 &&
      digits.length <= 15 &&
      !looksLikeCalendarDateDigits(digits)
    ) {
      const validated = readValidatedPhoneForBookingSearch(digits);
      if (validated && (/^[\d\s+\-().٠-٩۰-۹]+$/.test(text) || hasPhoneCue)) {
        return validated;
      }
    }
  }
  return null;
}

function hasSuccessfulSearchBookings(
  toolExecutions: ToolCallLoopResult["toolExecutions"],
): boolean {
  return toolExecutions.some(
    (execution) =>
      execution.toolKey === "search_bookings" &&
      execution.status === "succeeded" &&
      execution.output?.success === true,
  );
}

function readLastSearchBookings(
  toolExecutions: ToolCallLoopResult["toolExecutions"],
): Array<Record<string, unknown>> {
  const lastSearch = [...toolExecutions]
    .reverse()
    .find(
      (execution) =>
        execution.toolKey === "search_bookings" &&
        execution.status === "succeeded" &&
        execution.output?.success === true,
    );
  const bookings = lastSearch?.output?.bookings;
  return Array.isArray(bookings) ? (bookings as Array<Record<string, unknown>>) : [];
}

function resolveSelectedCancelBookingId(
  messages: RuntimeGatewayChatRequest["messages"],
  toolExecutions: ToolCallLoopResult["toolExecutions"],
): string | null {
  const bookings = readActiveCancellableBookings(toolExecutions);
  if (bookings.length === 0) return null;

  const latestUserText = String(
    [...messages].reverse().find((message) => message.role === "user")?.content ?? "",
  ).trim();
  if (!latestUserText) return null;

  const refMatch = latestUserText.match(/\bBK-\d+\b/i);
  if (refMatch) {
    const wanted = refMatch[0].toUpperCase();
    const matched = bookings.find(
      (booking) => String(booking.reference ?? "").trim().toUpperCase() === wanted,
    );
    const bookingId = matched?.bookingId ?? matched?.id;
    return typeof bookingId === "string" && bookingId.trim() ? bookingId.trim() : null;
  }

  const indexMatch = latestUserText.match(/^\s*([1-8])\s*$/);
  if (indexMatch) {
    const index = Number(indexMatch[1]) - 1;
    const matched = bookings[index];
    const bookingId = matched?.bookingId ?? matched?.id;
    return typeof bookingId === "string" && bookingId.trim() ? bookingId.trim() : null;
  }

  // "ألغي آخر حجز" → soonest upcoming eligible booking only (never arbitrary latest DB row).
  if (customerWantsCancelLastBookingFromText(latestUserText)) {
    const sorted = [...bookings].sort((a, b) => {
      const aMs = Date.parse(String(a.scheduledAt ?? a.start_at ?? ""));
      const bMs = Date.parse(String(b.scheduledAt ?? b.start_at ?? ""));
      return aMs - bMs;
    });
    const matched = sorted[0];
    const bookingId = matched?.bookingId ?? matched?.id;
    return typeof bookingId === "string" && bookingId.trim() ? bookingId.trim() : null;
  }

  if (bookings.length === 1 && (
    isBareCancelConfirmationText(latestUserText) ||
    isBareAffirmativeConfirmationText(latestUserText)
  )) {
    // Require prior cancel-list (or explicit نعم) — first bare "ألغي" only lists.
    const isExplicitYes = isBareAffirmativeConfirmationText(latestUserText);
    if (!isExplicitYes && !conversationAwaitingCancelSelection(messages)) {
      return null;
    }
    const bookingId = bookings[0]?.bookingId ?? bookings[0]?.id;
    return typeof bookingId === "string" && bookingId.trim() ? bookingId.trim() : null;
  }

  return null;
}

function buildForcedCancelBookingInput(
  messages: RuntimeGatewayChatRequest["messages"],
  toolExecutions: ToolCallLoopResult["toolExecutions"],
  args: Record<string, unknown> = {},
): Record<string, unknown> {
  const latestUserText = String(
    [...messages].reverse().find((message) => message.role === "user")?.content ?? "",
  ).trim();
  const selectedBookingId = resolveSelectedCancelBookingId(messages, toolExecutions);
  const argReference =
    typeof args.bookingReference === "string" && args.bookingReference.trim()
      ? args.bookingReference.trim().toUpperCase()
      : null;
  const userReference = latestUserText.match(/\bBK-\d+\b/i)?.[0]?.toUpperCase() ?? null;
  const bookingReference = argReference ?? userReference;
  const phone = readPhoneForBookingSearch(messages);
  const offeredReference =
    bookingReference != null &&
    (conversationOfferedCancelReference(messages, bookingReference) ||
      conversationAwaitingCancelSelection(messages));

  const bookingId =
    (typeof selectedBookingId === "string" && selectedBookingId.trim()
      ? selectedBookingId.trim()
      : null) ??
    (typeof args.bookingId === "string" && args.bookingId.trim() ? args.bookingId.trim() : null);

  const cleanedArgs = { ...args };
  delete cleanedArgs.bookingId;
  delete cleanedArgs.bookingReference;
  delete cleanedArgs.phone;
  delete cleanedArgs.conversationScopedCancel;

  return {
    ...cleanedArgs,
    ...(bookingId ? { bookingId } : {}),
    ...(bookingReference ? { bookingReference } : {}),
    ...(phone ? { phone } : {}),
    ...(offeredReference ? { conversationScopedCancel: true } : {}),
  };
}

function shouldBlockCancelBooking(
  messages: RuntimeGatewayChatRequest["messages"],
  toolExecutions: ToolCallLoopResult["toolExecutions"],
): boolean {
  // Reschedule / attendance must never cancel even if a BK id is already resolved.
  if (customerWantsRescheduleBooking(messages)) return true;
  if (customerWantsCheckInOrOut(messages)) return true;
  if (resolveSelectedCancelBookingId(messages, toolExecutions) != null) return false;
  const latestUserText = String(
    [...messages].reverse().find((message) => message.role === "user")?.content ?? "",
  ).trim();
  // Customer already picked a BK-/list number — allow cancel_booking (by reference) this turn.
  if (customerWantsCancelBooking(messages) && canProceedWithCancelSelection(messages, toolExecutions)) {
    return false;
  }
  return true;
}

function readSearchBookingsReply(output: Record<string, unknown> | null): string | null {
  if (!output || output.success !== true) return null;
  const customerFacingMessage = output.customerFacingMessage;
  if (typeof customerFacingMessage === "string" && customerFacingMessage.trim()) {
    return customerFacingMessage.trim();
  }
  return null;
}

function isBareCancelConfirmationText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (customerWantsRescheduleFromText(trimmed)) return false;
  if (/\bBK-\d+\b/i.test(trimmed)) return false;
  if (/^\s*[1-8]\s*$/.test(trimmed)) return false;
  // Bare cancel verbs only. Affirmatives (نعم/ايوه) require an offered cancel list —
  // see assistantOfferedCancelList in customerWantsCancelBooking.
  return /^(?:الغي|ألغي|الغى|الغاء|إلغاء)(?:\s+(?:الميعاد|الموعد|الحجز|ميعاد|موعد))?$/i.test(
    trimmed,
  );
}

function isBareAffirmativeConfirmationText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (customerWantsRescheduleFromText(trimmed)) return false;
  if (latestUserWantsCreateBooking([{ role: "user", content: trimmed }])) return false;
  return /^(?:نعم|ايوه|أيوه|موافق|ok|yes|confirm|confirmed)$/i.test(trimmed);
}

function assistantOfferedCancelList(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  return messages
    .filter((message) => message.role === "assistant")
    .slice(-8)
    .map((message) => String(message.content ?? ""))
    .some((text) =>
      /أنهي موعد|ممكن إلغاؤه|موعد تلغي|ده الموعد الوحيد|قولّي\s*"?ألغي|قولي\s*"?ألغي|مش هألغي غير بعد ما تختاري|which appointment|select.*(?:cancel|booking)/i.test(
        text,
      ),
    );
}

function isCancelSelectionMessage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (customerWantsBookingStatusFromText(trimmed)) return false;
  // Reschedule (BK + new slot) must not be treated as cancel selection.
  if (customerWantsRescheduleFromText(trimmed)) return false;
  if (/\bBK-\d+\b/i.test(trimmed)) {
    if (/(?:الغي|ألغي|الغى|الغاء|إلغاء|cancel)/i.test(trimmed)) return true;
    return /^\s*BK-\d+\s*$/i.test(trimmed);
  }
  if (/^\s*[1-8]\s*$/.test(trimmed)) return true;
  return false;
}

function customerWantsCancelLastBookingFromText(text: string): boolean {
  return /(?:الغي|ألغي|الغى|الغاء|إلغاء).{0,12}(?:آخر|اخر)\s*(?:حجز|موعد|ميعاد)/i.test(
    text.trim(),
  );
}

function customerWantsCancelLastBooking(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  return customerWantsCancelLastBookingFromText(latestUserTextFromMessages(messages));
}

function isFutureCancellableBookingRecord(
  booking: Record<string, unknown>,
  referenceNowMs: number = Date.now(),
): boolean {
  const status = String(booking.status ?? "").trim().toLowerCase();
  if (
    status === "cancelled" ||
    status === "canceled" ||
    status === "completed" ||
    status === "checked_out" ||
    status === "no_show" ||
    status === "rescheduled" ||
    status === "expired"
  ) {
    return false;
  }
  const scheduledAt = String(booking.scheduledAt ?? booking.start_at ?? "").trim();
  if (!scheduledAt) {
    // Status already passed non-cancellable checks; allow rows without a timestamp
    // (legacy tool payloads). Dated past appointments remain excluded below.
    return true;
  }
  const startMs = Date.parse(scheduledAt);
  return Number.isFinite(startMs) && startMs > referenceNowMs;
}

function readActiveCancellableBookings(
  toolExecutions: ToolCallLoopResult["toolExecutions"],
): Array<Record<string, unknown>> {
  return readLastSearchBookings(toolExecutions).filter((booking) =>
    isFutureCancellableBookingRecord(booking),
  );
}

/** Bare ألغي may proceed when a sole cancellable booking is known this turn, or while awaiting selection. */
function canProceedWithCancelSelection(
  messages: RuntimeGatewayChatRequest["messages"],
  toolExecutions: ToolCallLoopResult["toolExecutions"],
): boolean {
  const latestUserText = latestUserTextFromMessages(messages);
  if (isCancelSelectionMessage(latestUserText)) return true;
  if (resolveSelectedCancelBookingId(messages, toolExecutions) != null) return true;
  if (
    !isBareCancelConfirmationText(latestUserText) &&
    !isBareAffirmativeConfirmationText(latestUserText)
  ) {
    return false;
  }
  if (!customerWantsCancelBooking(messages)) return false;
  const active = readActiveCancellableBookings(toolExecutions);
  // This-turn search found exactly one booking — cancel only after list was shown / نعم.
  if (active.length === 1) {
    const isExplicitYes = isBareAffirmativeConfirmationText(latestUserText);
    return isExplicitYes || conversationAwaitingCancelSelection(messages);
  }
  if (!conversationAwaitingCancelSelection(messages)) return false;
  return active.length <= 1;
}

function shouldSuppressCancelListReply(
  messages: RuntimeGatewayChatRequest["messages"],
  toolExecutions: ToolCallLoopResult["toolExecutions"],
): boolean {
  const latestUserText = latestUserTextFromMessages(messages);
  if (isCancelSelectionMessage(latestUserText)) return true;
  return resolveSelectedCancelBookingId(messages, toolExecutions) != null;
}

function hasSuccessfulCheckIn(
  toolExecutions: ToolCallLoopResult["toolExecutions"],
): boolean {
  return toolExecutions.some(
    (execution) =>
      execution.toolKey === "check_in" &&
      execution.status === "succeeded" &&
      execution.output?.success === true,
  );
}

function hasSuccessfulCheckOut(
  toolExecutions: ToolCallLoopResult["toolExecutions"],
): boolean {
  return toolExecutions.some(
    (execution) =>
      execution.toolKey === "check_out" &&
      execution.status === "succeeded" &&
      execution.output?.success === true,
  );
}

function applyCheckInOutReplyFallback(
  response: RuntimeGatewayChatResponse,
  toolExecutions: ToolCallLoopResult["toolExecutions"],
): RuntimeGatewayChatResponse {
  const last = [...toolExecutions]
    .reverse()
    .find((execution) => execution.toolKey === "check_in" || execution.toolKey === "check_out");
  if (!last) return response;
  const facing =
    typeof last.output?.customerFacingMessage === "string"
      ? last.output.customerFacingMessage.trim()
      : "";
  if (last.status === "succeeded" && last.output?.success === true && facing) {
    return { ...response, text: facing, finishReason: response.finishReason ?? "stop" };
  }
  if (facing && (!response.text.trim() || /اسم المريض|جارٍ التفكير|أعتذر|مشكلة/.test(response.text))) {
    return { ...response, text: facing, finishReason: response.finishReason ?? "stop" };
  }
  // Phase 5Q.1: surface timeouts/failures so the UI is not left blank after a long attendance turn.
  if (
    !response.text.trim() &&
    (last.status === "timeout" || last.status === "failed" || last.status === "denied")
  ) {
    const isOut = last.toolKey === "check_out";
    const fallback = isOut
      ? "ما قدرناش نكمّل تسجيل الانصراف دلوقتي. جرّبي تاني بعد لحظات أو ابعتي رقم الحجز تاني."
      : "ما قدرناش نكمّل تسجيل الحضور دلوقتي. جرّبي تاني بعد لحظات أو ابعتي رقم الحجز تاني.";
    return {
      ...response,
      text: fallback,
      finishReason: response.finishReason ?? "stop",
    };
  }
  return response;
}

/**
 * When the user asks to check in/out with a BK- reference (and phone when needed),
 * force the mutation tool instead of drifting into create-booking intake.
 */
async function forceCheckInOutIfReady(input: {
  tools: RuntimeToolPort;
  ctx: ServiceContext;
  conversationId: string;
  allowedToolKeys: string[];
  sourceMessages: RuntimeGatewayChatRequest["messages"];
  toolExecutions: ToolCallLoopResult["toolExecutions"];
}): Promise<void> {
  if (!customerWantsCheckInOrOut(input.sourceMessages)) return;

  let anyRef: string | null = null;
  let wantsOut = false;
  for (const message of [...input.sourceMessages].reverse()) {
    if (message.role !== "user") continue;
    const text = String(message.content ?? "");
    if (!anyRef) {
      const m = text.match(/\bBK-\d+\b/i);
      if (m) anyRef = m[0].toUpperCase();
    }
    if (/تسجيل\s*انصراف|check[_\s-]?out|انصرافي|أسجل انصراف/i.test(text)) {
      wantsOut = true;
    }
  }
  if (!anyRef) return;

  const phone = readPhoneForBookingSearch(input.sourceMessages);
  const toolKey = wantsOut ? "check_out" : "check_in";
  if (toolKey === "check_in" && hasSuccessfulCheckIn(input.toolExecutions)) return;
  if (toolKey === "check_out" && hasSuccessfulCheckOut(input.toolExecutions)) return;
  // Do not re-force after any prior attempt in this turn (incl. timeout) — avoids duplicate mutations.
  if (
    input.toolExecutions.some(
      (execution) => execution.toolKey === toolKey && execution.status !== "denied",
    )
  ) {
    return;
  }

  const allowed = new Set([
    ...input.allowedToolKeys,
    ...(typeof input.tools.allowedToolKeys === "function" ? input.tools.allowedToolKeys() : []),
  ]);
  if (!allowed.has(toolKey)) return;

  const routed = await input.tools.route(input.ctx, {
    conversationId: input.conversationId,
    toolKey,
    input: {
      bookingReference: anyRef,
      ...(phone ? { phone } : {}),
    },
    triggeredBy: "agent",
  });
  input.toolExecutions.push({
    toolKey: routed.toolKey,
    executionId: routed.executionId,
    status: routed.status,
    output: routed.output,
    durationMs: routed.durationMs,
  });
}

function hasSuccessfulRescheduleBooking(
  toolExecutions: ToolCallLoopResult["toolExecutions"],
): boolean {
  return toolExecutions.some(
    (execution) =>
      execution.toolKey === "reschedule_booking" &&
      execution.status === "succeeded" &&
      execution.output?.success === true,
  );
}

function rewriteRescheduleBookingArgs(
  args: Record<string, unknown> | undefined,
  messages: RuntimeGatewayChatRequest["messages"],
): Record<string, unknown> {
  const next = { ...(args ?? {}) };
  // Prefer explicit weekday+time on the reschedule turn over a stale create-booking slot.
  const slot =
    parseRescheduleWeekdaySlotFromMessages(messages) ?? parseSelectedBookingSlot(messages);
  if (slot) {
    next.date = slot.date;
    next.slotStart = slot.slotStart;
  }
  let bookingReference: string | null =
    typeof next.bookingReference === "string" ? next.bookingReference.trim().toUpperCase() : null;
  let bookingId = typeof next.bookingId === "string" ? next.bookingId.trim() : "";
  if (/^BK-\d+$/i.test(bookingId)) {
    bookingReference = bookingId.toUpperCase();
    // Keep bookingId as BK-… for legacy tool_definitions schemas that still require bookingId.
    next.bookingId = bookingReference;
  }
  if (!bookingReference) {
    for (const message of [...messages].reverse()) {
      if (message.role !== "user") continue;
      const ref = String(message.content ?? "").match(/\bBK-\d+\b/i)?.[0];
      if (ref) {
        bookingReference = ref.toUpperCase();
        break;
      }
    }
  }
  if (bookingReference) {
    next.bookingReference = bookingReference;
    if (!String(next.bookingId ?? "").trim()) next.bookingId = bookingReference;
  }
  const phone = readPhoneForBookingSearch(messages);
  if (phone) next.phone = phone;
  return next;
}

/**
 * When the user asks to reschedule with BK + new date/time, force reschedule_booking
 * instead of drifting into cancel or create-booking intake.
 */
async function forceRescheduleIfReady(input: {
  tools: RuntimeToolPort;
  ctx: ServiceContext;
  conversationId: string;
  allowedToolKeys: string[];
  sourceMessages: RuntimeGatewayChatRequest["messages"];
  toolExecutions: ToolCallLoopResult["toolExecutions"];
  trustedCustomerId?: string | null;
}): Promise<void> {
  if (!customerWantsRescheduleBooking(input.sourceMessages)) return;
  if (hasSuccessfulRescheduleBooking(input.toolExecutions)) return;
  if (
    input.toolExecutions.some(
      (execution) =>
        execution.toolKey === "reschedule_booking" && execution.status !== "denied",
    )
  ) {
    return;
  }

  const allowed = new Set([
    ...input.allowedToolKeys,
    ...(typeof input.tools.allowedToolKeys === "function" ? input.tools.allowedToolKeys() : []),
  ]);
  if (!allowed.has("reschedule_booking")) return;

  const pushGuidance = (customerFacingMessage: string, errors: string[]) => {
    input.toolExecutions.push({
      toolKey: "reschedule_booking",
      executionId: `forced-reschedule-guidance-${Date.now()}`,
      status: "failed",
      output: {
        success: false,
        errors,
        message: errors[0] ?? "RESCHEDULE_GUIDANCE",
        customerFacingMessage,
      },
      durationMs: 0,
    });
  };

  let bookingReference: string | null = null;
  for (const message of [...input.sourceMessages].reverse()) {
    if (message.role !== "user") continue;
    const m = String(message.content ?? "").match(/\bBK-\d+\b/i);
    if (m) {
      bookingReference = m[0].toUpperCase();
      break;
    }
  }
  if (!bookingReference) {
    pushGuidance(RESCHEDULE_ASK_BOOKING_REF_MESSAGE, ["RESCHEDULE_BOOKING_REF_REQUIRED"]);
    return;
  }

  const slot =
    parseRescheduleWeekdaySlotFromMessages(input.sourceMessages) ??
    parseSelectedBookingSlot(input.sourceMessages);
  if (!slot) {
    pushGuidance(RESCHEDULE_ASK_SLOT_MESSAGE, ["RESCHEDULE_SLOT_REQUIRED"]);
    return;
  }

  const phone = readPhoneForBookingSearch(input.sourceMessages);
  const trusted = hasTrustedBookingIdentity(input.trustedCustomerId)
    ? input.trustedCustomerId!.trim()
    : null;
  // Trusted WhatsApp/CRM identity satisfies ownership — do not re-ask for phone.
  if (!phone && !trusted) {
    pushGuidance(RESCHEDULE_ASK_PHONE_MESSAGE, ["CUSTOMER_CONTEXT_REQUIRED"]);
    return;
  }

  try {
    const routed = await input.tools.route(input.ctx, {
      conversationId: input.conversationId,
      toolKey: "reschedule_booking",
      input: {
        // Stale tool_definitions schema still requires bookingId; handler also accepts BK- as reference.
        bookingId: bookingReference,
        bookingReference,
        date: slot.date,
        slotStart: slot.slotStart,
        ...(phone ? { phone } : {}),
        ...(trusted ? { trustedCustomerId: trusted } : {}),
      },
      triggeredBy: "agent",
    });
    input.toolExecutions.push({
      toolKey: routed.toolKey,
      executionId: routed.executionId,
      status: routed.status,
      output: routed.output,
      durationMs: routed.durationMs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reschedule booking failed.";
    input.toolExecutions.push({
      toolKey: "reschedule_booking",
      executionId: `forced-reschedule-error-${Date.now()}`,
      status: "failed",
      output: {
        success: false,
        errors: ["RESCHEDULE_FORCE_FAILED"],
        message,
        customerFacingMessage:
          "ما قدرناش نغيّر ميعاد الحجز ده دلوقتي. ابعتي رقم الحجز والميعاد الجديد ورقم الموبايل تاني.",
      },
      durationMs: 0,
    });
  }
}

function applyRescheduleBookingReplyFallback(
  response: RuntimeGatewayChatResponse,
  toolExecutions: ToolCallLoopResult["toolExecutions"],
): RuntimeGatewayChatResponse {
  const last = [...toolExecutions]
    .reverse()
    .find((execution) => execution.toolKey === "reschedule_booking");
  if (!last) return response;
  const facing =
    typeof last.output?.customerFacingMessage === "string"
      ? last.output.customerFacingMessage.trim()
      : "";
  if (last.status === "succeeded" && last.output?.success === true && facing) {
    return { ...response, text: facing, finishReason: response.finishReason ?? "stop" };
  }
  if (
    facing &&
    (!response.text.trim() ||
      /اسم المريض|جارٍ التفكير|أعتذر|مشكلة|عمر|رقم الهاتف|رقم التليفون|حجز جديد|نكمّل الحجز/i.test(
        response.text,
      ))
  ) {
    return { ...response, text: facing, finishReason: response.finishReason ?? "stop" };
  }
  return response;
}

function applyNonMutatingFollowUpGuard(
  response: RuntimeGatewayChatResponse,
  messages: RuntimeGatewayChatRequest["messages"],
): RuntimeGatewayChatResponse {
  const latest = latestUserTextFromMessages(messages).trim();
  if (!isNonMutatingFollowUpMessage(latest)) return response;
  const text = response.text.trim();
  if (!/المواعيد المتاحة|اختاري الموعد|حجز موعدك|create_booking/i.test(text)) return response;

  let priorUser = "";
  let seenLatest = false;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") continue;
    const content = String(message.content ?? "").trim();
    if (!seenLatest) {
      seenLatest = true;
      continue;
    }
    priorUser = content;
    break;
  }

  if (customerWantsRescheduleFromText(priorUser)) {
    return {
      ...response,
      text: "عشان نغيّر الميعاد، محتاجين نحدد الحجز واليوم والساعة الجديدة (مثل BK-000088 يوم 24-08-2026 الساعة 08:00).",
      finishReason: response.finishReason ?? "stop",
    };
  }

  return {
    ...response,
    text: "ممكن توضحي أكتر إيه اللي محتاجة توضيحه؟",
    finishReason: response.finishReason ?? "stop",
  };
}

/** Prevent create-booking intake copy from leaking into an active reschedule turn. */
function applyRescheduleTopicGuard(
  response: RuntimeGatewayChatResponse,
  messages: RuntimeGatewayChatRequest["messages"],
  toolExecutions: ToolCallLoopResult["toolExecutions"],
): RuntimeGatewayChatResponse {
  if (!customerWantsRescheduleBooking(messages)) return response;
  if (hasSuccessfulRescheduleBooking(toolExecutions)) return response;

  const lastReschedule = [...toolExecutions]
    .reverse()
    .find((execution) => execution.toolKey === "reschedule_booking");
  const facing =
    typeof lastReschedule?.output?.customerFacingMessage === "string"
      ? lastReschedule.output.customerFacingMessage.trim()
      : "";
  if (facing) {
    return { ...response, text: facing, finishReason: response.finishReason ?? "stop" };
  }

  const text = response.text.trim();
  if (!text || /اسم المريض|نكمّل الحجز|create_booking|حجز جديد/i.test(text)) {
    if (!parseSelectedBookingSlot(messages)) {
      return {
        ...response,
        text: RESCHEDULE_ASK_SLOT_MESSAGE,
        finishReason: response.finishReason ?? "stop",
      };
    }
    if (!readPhoneForBookingSearch(messages)) {
      return {
        ...response,
        text: RESCHEDULE_ASK_PHONE_MESSAGE,
        finishReason: response.finishReason ?? "stop",
      };
    }
    return {
      ...response,
      text: RESCHEDULE_ASK_BOOKING_REF_MESSAGE,
      finishReason: response.finishReason ?? "stop",
    };
  }
  return response;
}

function hasSuccessfulCancelBooking(
  toolExecutions: ToolCallLoopResult["toolExecutions"],
): boolean {
  return toolExecutions.some(
    (execution) =>
      execution.toolKey === "cancel_booking" &&
      execution.status === "succeeded" &&
      execution.output?.success === true,
  );
}

function readCancelBookingReply(output: Record<string, unknown> | null): string | null {
  if (!output || output.success !== true) return null;
  const customerFacingMessage = output.customerFacingMessage;
  if (typeof customerFacingMessage === "string" && customerFacingMessage.trim()) {
    return customerFacingMessage.trim();
  }
  const reference = typeof output.reference === "string" ? output.reference.trim() : "";
  if (reference) return `تم إلغاء الحجز ${reference} بنجاح.`;
  return "تم إلغاء الحجز بنجاح.";
}

function applyCancelBookingReplyFallback(
  response: RuntimeGatewayChatResponse,
  toolExecutions: ToolCallLoopResult["toolExecutions"],
): RuntimeGatewayChatResponse {
  const text = response.text.trim();
  const claimsCancelSuccess = /تم\s*إلغاء\s*(?:الحجز|الموعد)/i.test(text);

  const lastCancel = [...toolExecutions]
    .reverse()
    .find((execution) => execution.toolKey === "cancel_booking");

  if (claimsCancelSuccess && !hasSuccessfulCancelBooking(toolExecutions)) {
    const failureMessage =
      typeof lastCancel?.output?.customerFacingMessage === "string"
        ? lastCancel.output.customerFacingMessage.trim()
        : "";
    return {
      ...response,
      text:
        failureMessage ||
        "ما قدرناش نلغي الحجز ده دلوقتي. ابعتي رقم الحجز تاني (مثل BK-000028).",
      finishReason: response.finishReason ?? "stop",
    };
  }

  if (!lastCancel) return response;

  if (lastCancel.status === "succeeded" && lastCancel.output?.success === true) {
    const reply = readCancelBookingReply(lastCancel.output ?? null);
    if (!reply) return response;
    return {
      ...response,
      text: reply,
      finishReason: response.finishReason ?? "stop",
    };
  }

  const failureMessage = lastCancel.output?.customerFacingMessage;
  if (typeof failureMessage === "string" && failureMessage.trim()) {
    return {
      ...response,
      text: failureMessage.trim(),
      finishReason: response.finishReason ?? "stop",
    };
  }
  return response;
}

function applySearchBookingsReplyFallback(
  response: RuntimeGatewayChatResponse,
  toolExecutions: ToolCallLoopResult["toolExecutions"],
  messages: RuntimeGatewayChatRequest["messages"] = [],
): RuntimeGatewayChatResponse {
  if (hasSuccessfulCancelBooking(toolExecutions)) return response;
  if (hasSuccessfulCreateBooking(toolExecutions)) return response;
  if (isActiveCreateBookingTurn(messages, toolExecutions)) return response;

  const latestUserText = String(
    [...messages].reverse().find((message) => message.role === "user")?.content ?? "",
  ).trim();
  if (customerWantsCancelBooking(messages) && shouldSuppressCancelListReply(messages, toolExecutions)) {
    // Selection turn: do not re-dump the full booking list.
    return response;
  }

  const lastSearch = [...toolExecutions]
    .reverse()
    .find(
      (execution) =>
        execution.toolKey === "search_bookings" &&
        execution.status === "succeeded" &&
        execution.output?.success === true,
    );
  if (!lastSearch) return response;
  const reply = readSearchBookingsReply(lastSearch.output ?? null);
  if (!reply) return response;
  return {
    ...response,
    text: reply,
    finishReason: response.finishReason ?? "stop",
  };
}

const ASK_BOOKING_PHONE_REPLY = EXPLICIT_BOOKING_LOOKUP_PHONE_REPLY;

function applyAskBookingPhoneFallback(
  response: RuntimeGatewayChatResponse,
  messages: RuntimeGatewayChatRequest["messages"],
  toolExecutions: ToolCallLoopResult["toolExecutions"],
  trustedCustomerId?: string | null,
): RuntimeGatewayChatResponse {
  if (hasTrustedBookingIdentity(trustedCustomerId)) return response;
  if (hasSuccessfulSearchBookings(toolExecutions)) return response;
  if (hasSuccessfulCancelBooking(toolExecutions)) return response;
  // Never hijack an active create-booking turn with the old-bookings phone prompt.
  if (latestUserWantsCreateBooking(messages)) return response;
  if (isActiveCreateBookingTurn(messages, toolExecutions)) return response;
  if (!customerWantsBookingLookup(messages) && !latestUserExplicitBookingLookup(messages)) {
    return response;
  }
  if (readPhoneForBookingSearch(messages)) return response;

  const latestUserText = String(
    [...messages].reverse().find((message) => message.role === "user")?.content ?? "",
  ).trim();
  // Never re-ask for phone when the customer already selected a booking to cancel.
  if (customerWantsCancelBooking(messages) && canProceedWithCancelSelection(messages, toolExecutions)) {
    return response;
  }

  const text = response.text.trim();
  if (
    !text ||
    /رقم\s*(?:ال)?(?:موبايل|هاتف|تليفون)/i.test(text) ||
    text.includes(ASK_BOOKING_PHONE_REPLY)
  ) {
    return {
      ...response,
      text: text && /رقم\s*(?:ال)?(?:موبايل|هاتف|تليفون)/i.test(text) ? text : ASK_BOOKING_PHONE_REPLY,
      finishReason: response.finishReason ?? "stop",
    };
  }
  return response;
}

async function forceSearchBookingsIfNeeded(input: {
  tools: RuntimeToolPort;
  ctx: ServiceContext;
  conversationId: string;
  allowedToolKeys: string[];
  sourceMessages: RuntimeGatewayChatRequest["messages"];
  toolExecutions: ToolCallLoopResult["toolExecutions"];
  responseText?: string;
}): Promise<void> {
  // Ticket list/status/mutation turns must never be hijacked into booking search/cancel lists.
  if (customerWantsAnyTicketFlow(input.sourceMessages)) return;
  const intake = readPatientIntakeFromConversation(input.sourceMessages);
  const latestUserText = String(
    [...input.sourceMessages].reverse().find((message) => message.role === "user")?.content ?? "",
  ).trim();
  if (
    ticketCustomerIntakeIsComplete(intake) &&
    !customerWantsCancelBooking(input.sourceMessages) &&
    !customerWantsCheckInOrOut(input.sourceMessages) &&
    !looksLikeBookingIntent(latestUserText)
  ) {
    return;
  }
  // Check-in/out with BK+phone must not be hijacked into a booking list.
  if (customerWantsCheckInOrOut(input.sourceMessages)) return;
  if (customerWantsRescheduleBooking(input.sourceMessages)) return;
  if (hasSuccessfulCheckIn(input.toolExecutions) || hasSuccessfulCheckOut(input.toolExecutions)) {
    return;
  }
  if (isActiveCreateBookingTurn(input.sourceMessages, input.toolExecutions)) return;
  // Slot-pick / post-availability create flow must not fall into booking lookup.
  if (
    conversationShowsRecentBookingAvailability(input.sourceMessages) &&
    !customerWantsCancelBooking(input.sourceMessages) &&
    !latestUserExplicitBookingLookup(input.sourceMessages) &&
    (latestUserWantsCreateBooking(input.sourceMessages) ||
      isSlotPickMessage(latestUserText) ||
      parseRelativeArabicBookingSlot(latestUserText) !== null ||
      looksLikeBookingIntent(latestUserText))
  ) {
    return;
  }
  if (readInvalidPhoneDuringBookingIntake(input.sourceMessages, input.toolExecutions)) return;
  if (
    hasSelectedBookingSlotContext(input.sourceMessages, input.toolExecutions) &&
    !latestUserExplicitBookingLookup(input.sourceMessages) &&
    !customerWantsCancelBooking(input.sourceMessages)
  ) {
    return;
  }
  const allowed = new Set([
    ...input.allowedToolKeys,
    ...(typeof input.tools.allowedToolKeys === "function" ? input.tools.allowedToolKeys() : []),
  ]);
  if (!allowed.has("search_bookings")) return;
  if (hasSuccessfulSearchBookings(input.toolExecutions)) return;

  const phone = readPhoneForBookingSearch(input.sourceMessages);
  if (!phone) return;

  const latestDigits = latestUserText.replace(/\D/g, "");
  const latestIsPhone =
    latestDigits.length >= 8 &&
    latestDigits.length <= 15 &&
    (/^[\d\s+\-().]+$/.test(latestUserText) || /(?:موبايل|هاتف|رقم|phone|mobile)/i.test(latestUserText));

  if (!customerWantsBookingLookup(input.sourceMessages) && !latestIsPhone) {
    return;
  }
  // Avoid stealing ticket-number-only messages.
  if (/^TKT-\d+$/i.test(latestUserText) || /^\d{5,8}$/.test(latestUserText)) {
    return;
  }
  // Selection turn: forceCancelBookingIfSelected owns search+cancel; don't re-list.
  if (canProceedWithCancelSelection(input.sourceMessages, input.toolExecutions)) {
    return;
  }
  // Topic change away from cancel/list — don't steal find_next / availability / recommend turns.
  if (latestUserSwitchedAwayFromCancel(latestUserText) && !latestIsPhone) {
    return;
  }

  const routed = await input.tools.route(input.ctx, {
    conversationId: input.conversationId,
    toolKey: "search_bookings",
    input: {
      phone,
      daysBack: 90,
      ...(customerWantsCancelBooking(input.sourceMessages) ? { purpose: "cancel" } : {}),
    },
    triggeredBy: "agent",
  });
  input.toolExecutions.push({
    toolKey: routed.toolKey,
    executionId: routed.executionId,
    status: routed.status,
    output: routed.output,
    durationMs: routed.durationMs,
  });
}

async function forceBookingStatusLookupIfNeeded(input: {
  tools: RuntimeToolPort;
  ctx: ServiceContext;
  conversationId: string;
  allowedToolKeys: string[];
  sourceMessages: RuntimeGatewayChatRequest["messages"];
  toolExecutions: ToolCallLoopResult["toolExecutions"];
}): Promise<void> {
  if (!customerWantsBookingStatusByReference(input.sourceMessages)) return;
  if (hasSuccessfulSearchBookings(input.toolExecutions)) return;
  const allowed = new Set([
    ...input.allowedToolKeys,
    ...(typeof input.tools.allowedToolKeys === "function" ? input.tools.allowedToolKeys() : []),
  ]);
  if (!allowed.has("search_bookings")) return;
  const phone = readPhoneForBookingSearch(input.sourceMessages);
  if (!phone) return;
  const routed = await input.tools.route(input.ctx, {
    conversationId: input.conversationId,
    toolKey: "search_bookings",
    input: { phone, daysBack: 90 },
    triggeredBy: "agent",
  });
  input.toolExecutions.push({
    toolKey: routed.toolKey,
    executionId: routed.executionId,
    status: routed.status,
    output: routed.output,
    durationMs: routed.durationMs,
  });
}

function applyBookingStatusReplyFallback(
  response: RuntimeGatewayChatResponse,
  toolExecutions: ToolCallLoopResult["toolExecutions"],
  messages: RuntimeGatewayChatRequest["messages"],
): RuntimeGatewayChatResponse {
  if (!customerWantsBookingStatusByReference(messages)) return response;
  const requestedReference =
    extractBookingReferenceFromStatusMessage(latestUserTextFromMessages(messages));
  const bookings = readLastSearchBookings(toolExecutions);
  const matched =
    requestedReference != null
      ? bookings.find(
          (booking) =>
            String(booking.reference ?? booking.confirmationNumber ?? "")
              .trim()
              .toUpperCase() === requestedReference,
        )
      : bookings[0];
  if (matched) {
    return {
      ...response,
      text: formatBookingStatusReply(matched),
      finishReason: response.finishReason ?? "stop",
    };
  }
  const text = response.text.trim();
  if (
    !text ||
    /تم\s*إلغاء\s*(?:الحجز|الموعد)/i.test(text) ||
    /create_booking|cancel_booking/i.test(text)
  ) {
    return {
      ...response,
      text: requestedReference
        ? `ما لقيناش حجز ${requestedReference} مرتبط بحسابك. تأكدي من رقم الحجز.`
        : "ما لقيناش حجز يطابق طلبك. ابعتي رقم الحجز (مثل BK-000088).",
      finishReason: response.finishReason ?? "stop",
    };
  }
  return response;
}

function extractBookingReferenceFromStatusMessage(text: string): string | null {
  const match = text.match(/\bBK-\d+\b/i);
  return match?.[0]?.toUpperCase() ?? null;
}

async function forceCancelBookingIfSelected(input: {
  tools: RuntimeToolPort;
  ctx: ServiceContext;
  conversationId: string;
  allowedToolKeys: string[];
  sourceMessages: RuntimeGatewayChatRequest["messages"];
  toolExecutions: ToolCallLoopResult["toolExecutions"];
}): Promise<void> {
  // Booking status lookup must never cancel.
  if (customerWantsBookingStatusByReference(input.sourceMessages)) return;
  // Ticket close/update must never inherit booking cancel selection.
  if (customerWantsTicketMutation(input.sourceMessages)) return;
  // Never cancel when the customer is checking in/out (BK + phone looks like cancel selection).
  if (customerWantsCheckInOrOut(input.sourceMessages)) return;
  // Never cancel when the customer is rescheduling (BK + new date/time).
  if (customerWantsRescheduleBooking(input.sourceMessages)) return;
  if (hasSuccessfulCheckIn(input.toolExecutions) || hasSuccessfulCheckOut(input.toolExecutions)) {
    return;
  }
  const allowed = new Set([
    ...input.allowedToolKeys,
    ...(typeof input.tools.allowedToolKeys === "function" ? input.tools.allowedToolKeys() : []),
  ]);
  if (!allowed.has("cancel_booking")) return;
  if (hasSuccessfulCancelBooking(input.toolExecutions)) return;

  const latestUserText = String(
    [...input.sourceMessages].reverse().find((message) => message.role === "user")?.content ?? "",
  ).trim();
  if (!canProceedWithCancelSelection(input.sourceMessages, input.toolExecutions)) return;

  const refMatch = latestUserText.match(/\bBK-\d+\b/i);
  const bookingReference = refMatch?.[0]?.toUpperCase() ?? null;
  // List numbers need cancel-flow context; bare BK-… can continue with phone/list ownership checks.
  // Reschedule/check-in already returned above; isCancelSelectionMessage excludes reschedule texts.
  if (!bookingReference && !customerWantsCancelBooking(input.sourceMessages)) return;

  const phone = readPhoneForBookingSearch(input.sourceMessages);
  const offeredReference =
    bookingReference != null &&
    conversationOfferedCancelReference(input.sourceMessages, bookingReference);
  const awaitingSelection = conversationAwaitingCancelSelection(input.sourceMessages);
  const canCancelByListedReference =
    bookingReference != null && (offeredReference || awaitingSelection);

  // Selection turn with a listed BK: cancel directly — never re-list via search_bookings.
  if (canCancelByListedReference && bookingReference) {
    const routed = await input.tools.route(input.ctx, {
      conversationId: input.conversationId,
      toolKey: "cancel_booking",
      input: {
        bookingReference,
        conversationScopedCancel: true,
        ...(phone ? { phone } : {}),
      },
      triggeredBy: "agent",
    });
    input.toolExecutions.push({
      toolKey: routed.toolKey,
      executionId: routed.executionId,
      status: routed.status,
      output: routed.output,
      durationMs: routed.durationMs,
    });
    return;
  }

  // List number / BK without prior list in history: resolve via phone-owned search, then cancel.
  if (!hasSuccessfulSearchBookings(input.toolExecutions)) {
    if (phone && allowed.has("search_bookings")) {
      const searched = await input.tools.route(input.ctx, {
        conversationId: input.conversationId,
        toolKey: "search_bookings",
        input: { phone, daysBack: 90, purpose: "cancel" },
        triggeredBy: "agent",
      });
      input.toolExecutions.push({
        toolKey: searched.toolKey,
        executionId: searched.executionId,
        status: searched.status,
        output: searched.output,
        durationMs: searched.durationMs,
      });
    }
  }

  const bookingId = resolveSelectedCancelBookingId(input.sourceMessages, input.toolExecutions);

  // Prefer cancel-by-reference when the customer replied with BK-… (phone-authorized ownership).
  if (!bookingId && bookingReference && Boolean(phone)) {
    const routed = await input.tools.route(input.ctx, {
      conversationId: input.conversationId,
      toolKey: "cancel_booking",
      input: {
        bookingReference,
        conversationScopedCancel: false,
        phone,
      },
      triggeredBy: "agent",
    });
    input.toolExecutions.push({
      toolKey: routed.toolKey,
      executionId: routed.executionId,
      status: routed.status,
      output: routed.output,
      durationMs: routed.durationMs,
    });
    return;
  }

  if (!bookingId) return;

  const routed = await input.tools.route(input.ctx, {
    conversationId: input.conversationId,
    toolKey: "cancel_booking",
    input: {
      bookingId,
      ...(bookingReference ? { bookingReference } : {}),
      ...(phone ? { phone } : {}),
      conversationScopedCancel: offeredReference,
    },
    triggeredBy: "agent",
  });
  input.toolExecutions.push({
    toolKey: routed.toolKey,
    executionId: routed.executionId,
    status: routed.status,
    output: routed.output,
    durationMs: routed.durationMs,
  });
}

/**
 * Bare Arabic cancel ("ألغي" / "ألغي الميعاد") with trustedCustomerId:
 * force search_bookings(purpose=cancel) BEFORE the LLM so create_booking cannot run.
 * Exactly one cancellable booking → forceCancelBookingIfSelected cancels it.
 * Multiple → list only (no auto-cancel). Zero → existing empty-lookup reply.
 */
async function forceBareTrustedCancelLookupIfNeeded(input: {
  tools: RuntimeToolPort;
  ctx: ServiceContext;
  conversationId: string;
  allowedToolKeys: string[];
  sourceMessages: RuntimeGatewayChatRequest["messages"];
  toolExecutions: ToolCallLoopResult["toolExecutions"];
  trustedCustomerId?: string | null;
}): Promise<void> {
  if (customerWantsTicketMutation(input.sourceMessages)) return;
  if (customerWantsCheckInOrOut(input.sourceMessages)) return;
  if (customerWantsRescheduleBooking(input.sourceMessages)) return;
  if (!hasTrustedBookingIdentity(input.trustedCustomerId)) return;

  const latestUserText = latestUserTextFromMessages(input.sourceMessages);
  if (
    !isBareCancelConfirmationText(latestUserText) &&
    !customerWantsCancelLastBookingFromText(latestUserText) &&
    !(
      isBareAffirmativeConfirmationText(latestUserText) &&
      assistantOfferedCancelList(input.sourceMessages)
    )
  ) {
    return;
  }
  if (!customerWantsCancelBooking(input.sourceMessages)) return;

  const allowed = new Set([
    ...input.allowedToolKeys,
    ...(typeof input.tools.allowedToolKeys === "function" ? input.tools.allowedToolKeys() : []),
  ]);
  if (!allowed.has("search_bookings")) return;
  if (hasSuccessfulCancelBooking(input.toolExecutions)) return;
  if (hasSuccessfulSearchBookings(input.toolExecutions)) return;

  const phone = readPhoneForBookingSearch(input.sourceMessages);
  const routed = await input.tools.route(input.ctx, {
    conversationId: input.conversationId,
    toolKey: "search_bookings",
    input: {
      daysBack: 90,
      purpose: "cancel",
      trustedCustomerId: input.trustedCustomerId!.trim(),
      ...(phone ? { phone } : {}),
    },
    triggeredBy: "agent",
  });
  input.toolExecutions.push({
    toolKey: routed.toolKey,
    executionId: routed.executionId,
    status: routed.status,
    output: routed.output,
    durationMs: routed.durationMs,
  });
}

function readCreateTicketConfirmation(output: Record<string, unknown> | null): string | null {
  if (!output || output.success !== true) return null;
  const ticketNumber =
    typeof output.ticketNumber === "string" ? output.ticketNumber.trim() : "";
  if (!ticketNumber) return null;
  return [
    "تم فتح التذكرة بنجاح.",
    `رقم التذكرة: ${ticketNumber}`,
    "هنتابع الشكوى معاكِ.",
  ].join("\n");
}

function applyCloseTicketReplyFallback(
  response: RuntimeGatewayChatResponse,
  toolExecutions: ToolCallLoopResult["toolExecutions"],
): RuntimeGatewayChatResponse {
  const lastClose = [...toolExecutions]
    .reverse()
    .find((execution) => execution.toolKey === "close_ticket");
  if (!lastClose?.output) return response;
  const output = lastClose.output;
  if (output.success === true) return response;
  if (output.errorCode === "TICKET_ALREADY_CLOSED") {
    return {
      ...response,
      text: String(output.message ?? "هذه التذكرة مغلقة بالفعل."),
      finishReason: response.finishReason ?? "stop",
    };
  }
  return response;
}

function applyTicketReplyFallback(
  response: RuntimeGatewayChatResponse,
  toolExecutions: ToolCallLoopResult["toolExecutions"],
): RuntimeGatewayChatResponse {
  const lastTicket = readSuccessfulCreateTicket(toolExecutions);
  if (!lastTicket) return response;
  const confirmation = readCreateTicketConfirmation(lastTicket.output ?? null);
  if (!confirmation) return response;

  const ticketNumber = String(lastTicket.output?.ticketNumber ?? "").trim();
  const text = response.text.trim();
  if (ticketNumber && text.includes(ticketNumber)) return response;

  return {
    ...response,
    text: confirmation,
    finishReason: response.finishReason ?? "stop",
  };
}

function hasCreateBookingAttempt(toolExecutions: ToolCallLoopResult["toolExecutions"]): boolean {
  return toolExecutions.some((execution) => execution.toolKey === "create_booking");
}

function latestUserAllowsForcedCreateBooking(
  messages: RuntimeGatewayChatRequest["messages"],
  trustedCustomerId?: string | null,
): boolean {
  if (customerWantsCreateTicket(messages)) return false;
  if (customerWantsCancelBooking(messages) || customerWantsCheckInOrOut(messages)) return false;
  if (customerWantsRescheduleBooking(messages)) return false;
  const latest = latestUserTextFromMessages(messages).trim();
  if (!latest || isNonMutatingFollowUpMessage(latest)) return false;
  if (/^e2e-rt-|^idem-/i.test(latest)) return false;
  if (customerWantsBookingStatusByReference(messages)) return false;
  const intent = resolveSchedulingOperationIntent(messages);
  if (
    intent === "booking_status" ||
    intent === "ticket" ||
    intent === "cancel" ||
    intent === "reschedule" ||
    intent === "check_in_out"
  ) {
    return false;
  }
  if (latestUserWantsCreateBooking(messages)) return true;
  if (isSlotPickMessage(latest) || parseRelativeArabicBookingSlot(latest) !== null) return true;
  if (extractPhoneFromText(latest) || looksLikePatientName(latest, messages)) return true;
  if (hasTrustedBookingIdentity(trustedCustomerId)) return false;
  return false;
}

async function forceCreateBookingIfReady(input: {
  tools: RuntimeToolPort;
  ctx: ServiceContext;
  conversationId: string;
  allowedToolKeys: string[];
  messages: RuntimeGatewayChatRequest["messages"];
  sourceMessages: RuntimeGatewayChatRequest["messages"];
  toolExecutions: ToolCallLoopResult["toolExecutions"];
  trustedCustomerId?: string | null;
}): Promise<void> {
  if (hasSuccessfulCreateBooking(input.toolExecutions)) return;
  if (isFreshCreateBookingStartWithoutSlot(input.sourceMessages)) return;
  // Same-turn create_booking already attempted (incl. slot_unavailable) — do not hammer again.
  if (hasCreateBookingAttempt(input.toolExecutions)) return;
  if (customerWantsCancelBooking(input.sourceMessages)) return;
  if (customerWantsCreateTicket(input.sourceMessages) || customerWantsAnyTicketFlow(input.sourceMessages)) return;
  if (!latestUserAllowsForcedCreateBooking(input.sourceMessages, input.trustedCustomerId)) return;
  if (!input.allowedToolKeys.includes("create_booking")) return;
  const intake = readPatientIntakeFromConversation(input.sourceMessages);
  // Phase 2 — trustedCustomerId satisfies identity; conversational name/phone not required.
  if (!bookingIdentityIsSatisfied(intake, input.trustedCustomerId)) return;
  const customerId = readResolvedCustomerId(
    input.toolExecutions,
    input.sourceMessages,
    input.trustedCustomerId,
  );
  if (!customerId) return;
  const canonical = readLastSuccessfulSchedulingSlot(input.sourceMessages, input.toolExecutions);
  const userSlot = parseSelectedBookingSlot(input.sourceMessages, input.toolExecutions);
  const ids = readSchedulingCatalogIds(input.messages, input.toolExecutions);
  if (!canonical && (!userSlot || !ids)) return;
  const notes = buildPatientBookingNotes(input.sourceMessages);

  const bookingInput = canonical
    ? {
        customerId,
        serviceId: canonical.serviceId,
        resourceId: canonical.resourceId,
        date: canonical.date,
        slotStart: canonical.slotStart,
        ...(notes ? { notes } : {}),
      }
    : {
        customerId,
        serviceId: ids!.serviceId,
        resourceId: ids!.resourceId,
        date: userSlot!.date,
        slotStart: userSlot!.slotStart,
        ...(notes ? { notes } : {}),
      };

  const routed = await input.tools.route(input.ctx, {
    conversationId: input.conversationId,
    toolKey: "create_booking",
    input: rewriteCreateBookingArgs(bookingInput, input.sourceMessages, input.toolExecutions, input.trustedCustomerId),
    triggeredBy: "llm",
  });
  input.toolExecutions.push({
    toolKey: routed.toolKey,
    executionId: routed.executionId,
    status: routed.status,
    output: routed.output,
    durationMs: routed.durationMs,
  });
}

async function forceCreateTicketIfReady(input: {
  tools: RuntimeToolPort;
  ctx: ServiceContext;
  conversationId: string;
  allowedToolKeys: string[];
  sourceMessages: RuntimeGatewayChatRequest["messages"];
  toolExecutions: ToolCallLoopResult["toolExecutions"];
  trustedCustomerId?: string | null;
}): Promise<void> {
  if (!customerWantsCreateTicket(input.sourceMessages)) return;
  if (hasSuccessfulCreateTicket(input.toolExecutions)) return;
  if (latestUserWantsCreateBooking(input.sourceMessages)) return;
  const allowed = new Set([
    ...input.allowedToolKeys,
    ...(typeof input.tools.allowedToolKeys === "function" ? input.tools.allowedToolKeys() : []),
  ]);
  if (!allowed.has("create_ticket")) return;
  const latest = latestUserTextFromMessages(input.sourceMessages).trim();
  const routed = await input.tools.route(input.ctx, {
    conversationId: input.conversationId,
    toolKey: "create_ticket",
    input: {
      subject: "شكوى",
      description: latest || "عايز أفتح شكوى",
      priority: "normal",
      ...(hasTrustedBookingIdentity(input.trustedCustomerId)
        ? { customerId: input.trustedCustomerId!.trim() }
        : {}),
    },
    triggeredBy: "agent",
  });
  input.toolExecutions.push({
    toolKey: routed.toolKey,
    executionId: routed.executionId,
    status: routed.status,
    output: routed.output,
    durationMs: routed.durationMs,
  });
}

function formatCustomerBookingDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!match) return date.trim();
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function formatCustomerBookingTime(slotStart: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(slotStart.trim());
  if (!match) return slotStart.trim();
  return `${match[1]!.padStart(2, "0")}:${match[2]}`;
}

function formatCustomerBookingReference(
  confirmationNumber: string | null | undefined,
  bookingId: string,
): string {
  const confirmation = typeof confirmationNumber === "string" ? confirmationNumber.trim() : "";
  if (confirmation) return confirmation;
  // Never invent UUID-derived refs for customers — BK confirmation is authoritative.
  void bookingId;
  return "";
}

function formatStartAtForCustomer(startAt: string): string | null {
  const parsed = Date.parse(startAt);
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
    return `يوم ${day}-${month}-${year} الساعة ${hour}:${minute}`;
  } catch {
    return null;
  }
}

function readCreateBookingConfirmation(output: Record<string, unknown> | null): string | null {
  if (!output || output.success !== true) return null;

  const customerFacingMessage = output.customerFacingMessage;
  if (typeof customerFacingMessage === "string" && customerFacingMessage.trim()) {
    return customerFacingMessage.trim();
  }

  const bookingId = output.bookingId;
  if (typeof bookingId !== "string" || !bookingId.trim()) return null;

  const bookingRef =
    typeof output.bookingRef === "string" && output.bookingRef.trim()
      ? output.bookingRef.trim()
      : formatCustomerBookingReference(
          typeof output.confirmationNumber === "string" ? output.confirmationNumber : null,
          bookingId,
        );

  const date = typeof output.date === "string" ? output.date.trim() : "";
  const slotStart = typeof output.slotStart === "string" ? output.slotStart.trim() : "";
  if (date && slotStart) {
    return [
      "تم حجز موعدك بنجاح.",
      `الموعد: يوم ${formatCustomerBookingDate(date)} الساعة ${formatCustomerBookingTime(slotStart)}`,
      `رقم الحجز: ${bookingRef}`,
    ].join("\n");
  }

  const startAt = typeof output.startAt === "string" ? output.startAt.trim() : "";
  const when = startAt ? formatStartAtForCustomer(startAt) : null;
  return [
    "تم حجز موعدك بنجاح.",
    when ? `الموعد: ${when}` : null,
    `رقم الحجز: ${bookingRef}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function isFalseBookingConfirmation(text: string): boolean {
  return /تم\s*(?:الحجز|حجز)|تم تأكيد|bookingId|confirmed successfully/i.test(text.trim());
}

function readCreateBookingFailureMessage(output: Record<string, unknown> | null): string | null {
  if (!output || output.success !== false) return null;
  const customerFacingMessage = output.customerFacingMessage;
  if (typeof customerFacingMessage === "string" && customerFacingMessage.trim()) {
    return customerFacingMessage.trim();
  }
  return null;
}

function customerSearchWasEmpty(
  toolExecutions: ToolCallLoopResult["toolExecutions"],
  sourceMessages: RuntimeGatewayChatRequest["messages"] = [],
): boolean {
  if (readResolvedCustomerId(toolExecutions, sourceMessages)) return false;
  const lastSearch = [...toolExecutions]
    .reverse()
    .find((execution) => execution.toolKey === "search_customer" && execution.status === "succeeded");
  if (!lastSearch?.output) return false;
  const total = lastSearch.output.total;
  if (typeof total === "number") return total === 0;
  const customers = lastSearch.output.customers;
  return Array.isArray(customers) && customers.length === 0;
}

function applyBookingReplyFallback(
  response: RuntimeGatewayChatResponse,
  toolExecutions: ToolCallLoopResult["toolExecutions"],
  messages: RuntimeGatewayChatRequest["messages"] = [],
): RuntimeGatewayChatResponse {
  const text = response.text.trim();

  if (hasSuccessfulCreateBooking(toolExecutions)) {
    const lastBooking = [...toolExecutions]
      .reverse()
      .find(
        (execution) =>
          execution.toolKey === "create_booking" &&
          execution.status === "succeeded" &&
          execution.output?.success === true,
      );
    const confirmation = readCreateBookingConfirmation(lastBooking?.output ?? null);
    if (confirmation) {
      return { ...response, text: confirmation, finishReason: response.finishReason ?? "stop" };
    }
  }

  if (!text) return response;

  const lastFailedBooking = [...toolExecutions]
    .reverse()
    .find(
      (execution) =>
        execution.toolKey === "create_booking" &&
        execution.status === "succeeded" &&
        execution.output?.success === false,
    );
  const failureMessage = readCreateBookingFailureMessage(lastFailedBooking?.output ?? null);

  if (isFalseBookingConfirmation(text) && !hasSuccessfulCreateBooking(toolExecutions)) {
    if (failureMessage && !isPatientIntakeReply(failureMessage)) {
      return { ...response, text: failureMessage, finishReason: response.finishReason ?? "stop" };
    }
    return {
      ...response,
      text: bookingIntakeMessage(readPatientIntakeFromConversation(messages), messages),
      finishReason: response.finishReason ?? "stop",
    };
  }

  const resolvedCustomerId = readResolvedCustomerId(toolExecutions, messages);
  const alreadyHasDetails = conversationAlreadyHasPatientDetails(messages) || Boolean(resolvedCustomerId);

  if (isPatientIntakeReply(text) && alreadyHasDetails) {
    if (failureMessage && !isPatientIntakeReply(failureMessage)) {
      return { ...response, text: failureMessage, finishReason: response.finishReason ?? "stop" };
    }
    return {
      ...response,
      text: "بنكمل الحجز على نفس الاسم والموعد المختار.",
      finishReason: response.finishReason ?? "stop",
    };
  }

  if (!isBookingPlaceholderReply(text) && !isPatientIntakeReply(text)) return response;

  if (failureMessage && !isPatientIntakeReply(failureMessage)) {
    return { ...response, text: failureMessage, finishReason: response.finishReason ?? "stop" };
  }

  if (alreadyHasDetails) {
    if (isBookingPlaceholderReply(text) || isPatientIntakeReply(text)) {
      return {
        ...response,
        text: "بنكمل الحجز على نفس الاسم والموعد المختار.",
        finishReason: response.finishReason ?? "stop",
      };
    }
    return response;
  }

  if (customerSearchWasEmpty(toolExecutions, messages) || isBookingPlaceholderReply(text) || isPatientIntakeReply(text)) {
    return {
      ...response,
      text: bookingIntakeMessage(readPatientIntakeFromConversation(messages), messages),
      finishReason: response.finishReason ?? "stop",
    };
  }

  return response;
}

function applySearchAvailabilityReplyFallback(
  response: RuntimeGatewayChatResponse,
  toolExecutions: ToolCallLoopResult["toolExecutions"],
  messages: RuntimeGatewayChatRequest["messages"] = [],
): RuntimeGatewayChatResponse {
  // Booking outcome wins. Never re-send slot lists after create_booking ran in this turn.
  if (hasCreateBookingAttempt(toolExecutions)) return response;
  if (customerWantsCreateTicket(messages) || customerWantsAnyTicketFlow(messages)) return response;
  const latest = latestUserTextFromMessages(messages).trim();
  if (isNonMutatingFollowUpMessage(latest)) return response;
  if (
    isCompleteCustomerFullName(latest) &&
    !latestUserMessageHasBookingSlot(latest) &&
    !latestUserWantsCreateBooking(messages)
  ) {
    return response;
  }
  if (shouldSkipAvailabilityRestart(messages, toolExecutions)) {
    const text = response.text.trim();
    if (
      !text ||
      isAvailabilityPlaceholderReply(text) ||
      isBookingPlaceholderReply(text) ||
      isPatientIntakeReply(text) ||
      /المواعيد المتاحة/.test(text)
    ) {
      return {
        ...response,
        text: "بنكمل الحجز على نفس الاسم والموعد المختار.",
        finishReason: response.finishReason ?? "stop",
      };
    }
    return response;
  }

  const lastAvailability = lastUsableAvailability(toolExecutions);
  const summary = readSearchAvailabilitySummary(lastAvailability?.output ?? null);
  if (!summary) return response;

  const text = response.text.trim();
  if (text && responseIncludesAvailabilityDetails(text, summary)) return response;
  if (isFalseBookingConfirmation(text)) return response;

  return {
    ...response,
    text: `${summary}\n\nاختاري الموعد المناسب لكِ وسأكمل الحجز.`,
    finishReason: response.finishReason ?? "stop",
  };
}

export type ToolCallLoopInput = {
  ctx: ServiceContext;
  conversationId: string;
  gatewayRequest: RuntimeGatewayChatRequest;
  tools: unknown[];
  allowedToolKeys: string[];
  /**
   * Phase 2 — trusted CRM identity from conversation.customer_id (channel-resolved).
   * Never from LLM tool args. When set, booking identity intake (name/phone) is satisfied.
   */
  trustedCustomerId?: string | null;
  /** Prior-turn scheduling tool executions (e.g. search_availability) for cross-turn slot binding. */
  priorSchedulingToolExecutions?: ToolCallLoopResult["toolExecutions"];
};

export type ToolCallLoopResult = {
  response: RuntimeGatewayChatResponse;
  messages: RuntimeGatewayChatRequest["messages"];
  toolExecutions: Array<{
    toolKey: string;
    executionId: string;
    status: string;
    input?: Record<string, unknown> | null;
    output: Record<string, unknown> | null;
    durationMs: number;
  }>;
};

export class ToolCallLoopService {
  constructor(
    private readonly deps: {
      gateway: RuntimeGatewayPort;
      tools?: RuntimeToolPort;
    },
  ) {}

  async run(input: ToolCallLoopInput): Promise<ToolCallLoopResult> {
    if (!this.deps.tools || input.tools.length === 0) {
      const response = await this.deps.gateway.chatCompletion({
        ...input.gatewayRequest,
        tools: undefined,
      });
      return { response, messages: [...input.gatewayRequest.messages], toolExecutions: [] };
    }

    const messages = [...input.gatewayRequest.messages];
    const sourceMessages = input.gatewayRequest.messages;
    // Mutable: promote after successful create_customer so same-turn scheduling tools see trust.
    let trustedCustomerId = input.trustedCustomerId?.trim() || null;
    const dropPriorSeed = shouldDropPriorSchedulingSeed(input.gatewayRequest.messages);
    const priorSchedulingToolExecutions = dropPriorSeed
      ? []
      : (input.priorSchedulingToolExecutions ?? []).map(
          (execution, index) => ({
            ...execution,
            executionId: execution.executionId || `prior-scheduling-${index}-${execution.toolKey}`,
          }),
        );
    const toolExecutions: ToolCallLoopResult["toolExecutions"] = [...priorSchedulingToolExecutions];
    let response: RuntimeGatewayChatResponse | null = null;

    const pushForcedCancelFailure = (error: unknown) => {
      const message = error instanceof Error ? error.message : "Cancel booking failed.";
      toolExecutions.push({
        toolKey: "cancel_booking",
        executionId: `forced-cancel-error-${Date.now()}`,
        status: "failed",
        output: {
          success: false,
          errors: ["CANCEL_FORCE_FAILED"],
          message,
          customerFacingMessage:
            "ما قدرناش نلغي الحجز ده دلوقتي. ابعتي رقم الحجز تاني (مثل BK-000028).",
        },
        durationMs: 0,
      });
    };

      if (this.deps.tools) {
      try {
        const intake = readPatientIntakeFromConversation(sourceMessages);
        const hasTicketTools = input.allowedToolKeys.some((key) =>
          [
            "search_ticket",
            "create_ticket",
            "add_ticket_comment",
            "assign_ticket",
            "change_ticket_priority",
            "change_ticket_status",
            "update_ticket",
            "close_ticket",
          ].includes(key),
        );
        if (
          hasTicketTools &&
          !shouldDenyTicketToolsDuringBookingIntent(sourceMessages) &&
          (customerWantsAnyTicketFlow(sourceMessages) || ticketCustomerIntakeIsComplete(intake))
        ) {
          await forceEnsureCustomerProfile({
            tools: this.deps.tools,
            ctx: input.ctx,
            conversationId: input.conversationId,
            allowedToolKeys: input.allowedToolKeys,
            sourceMessages,
            toolExecutions,
          trustedCustomerId,
        });
        }
      } catch {
        // Never fail the turn because forced ticket customer intake threw.
      }

      try {
        // Check-in/out before cancel — BK + attendance must not enter cancel selection.
        await forceCheckInOutIfReady({
          tools: this.deps.tools,
          ctx: input.ctx,
          conversationId: input.conversationId,
          allowedToolKeys: input.allowedToolKeys,
          sourceMessages,
          toolExecutions,
        });
      } catch {
        // Never fail the turn because forced check-in/out threw.
      }

      try {
        await forceRescheduleIfReady({
          tools: this.deps.tools,
          ctx: input.ctx,
          conversationId: input.conversationId,
          allowedToolKeys: input.allowedToolKeys,
          sourceMessages,
          toolExecutions,
          trustedCustomerId,
        });
      } catch {
        // Never fail the turn because forced reschedule threw.
      }

      try {
        await forceFindNextAvailableIfReady({
          tools: this.deps.tools,
          ctx: input.ctx,
          conversationId: input.conversationId,
          allowedToolKeys: input.allowedToolKeys,
          sourceMessages,
          toolExecutions,
        });
      } catch {
        // Never fail the turn because forced find-next threw.
      }

      try {
        await forceSearchAvailabilityIfReady({
          tools: this.deps.tools,
          ctx: input.ctx,
          conversationId: input.conversationId,
          allowedToolKeys: input.allowedToolKeys,
          sourceMessages,
          toolExecutions,
        });
      } catch {
        // Never fail the turn because forced availability search threw.
      }

      try {
        await forceBookingStatusLookupIfNeeded({
          tools: this.deps.tools,
          ctx: input.ctx,
          conversationId: input.conversationId,
          allowedToolKeys: input.allowedToolKeys,
          sourceMessages,
          toolExecutions,
        });
      } catch {
        // Never fail the turn because forced booking-status lookup threw.
      }

      if (
        !hasSuccessfulCheckIn(toolExecutions) &&
        !hasSuccessfulCheckOut(toolExecutions) &&
        !hasSuccessfulRescheduleBooking(toolExecutions) &&
        !customerWantsBookingStatusByReference(sourceMessages)
      ) {
        try {
          await forceBareTrustedCancelLookupIfNeeded({
            tools: this.deps.tools,
            ctx: input.ctx,
            conversationId: input.conversationId,
            allowedToolKeys: input.allowedToolKeys,
            sourceMessages,
            toolExecutions,
            trustedCustomerId,
          });
        } catch {
          // Never fail the turn because forced bare-cancel lookup threw.
        }
        try {
          await forceCancelBookingIfSelected({
            tools: this.deps.tools,
            ctx: input.ctx,
            conversationId: input.conversationId,
            allowedToolKeys: input.allowedToolKeys,
            sourceMessages,
            toolExecutions,
          });
        } catch (error) {
          pushForcedCancelFailure(error);
        }
      }

      const earlyCheck = [...toolExecutions]
        .reverse()
        .find((execution) => execution.toolKey === "check_in" || execution.toolKey === "check_out");
      if (earlyCheck) {
        const earlyResponse = applyCheckInOutReplyFallback(
          {
            text: "",
            model: input.gatewayRequest.model ?? "unknown",
            providerKey: input.gatewayRequest.providerKey ?? "unknown",
            finishReason: "stop",
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            latencyMs: 0,
          },
          toolExecutions,
        );
        if (earlyResponse.text.trim()) {
          return { response: earlyResponse, messages, toolExecutions };
        }
      }

      const earlyReschedule = [...toolExecutions]
        .reverse()
        .find((execution) => execution.toolKey === "reschedule_booking");
      if (earlyReschedule) {
        const earlyResponse = applyRescheduleBookingReplyFallback(
          {
            text: "",
            model: input.gatewayRequest.model ?? "unknown",
            providerKey: input.gatewayRequest.providerKey ?? "unknown",
            finishReason: "stop",
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            latencyMs: 0,
          },
          toolExecutions,
        );
        if (earlyResponse.text.trim()) {
          return { response: earlyResponse, messages, toolExecutions };
        }
      }

      const earlyFindNext = [...toolExecutions]
        .reverse()
        .find((execution) => execution.toolKey === "find_next_available");
      if (earlyFindNext) {
        const earlyResponse = applyFindNextAvailableReplyFallback(
          {
            text: "",
            model: input.gatewayRequest.model ?? "unknown",
            providerKey: input.gatewayRequest.providerKey ?? "unknown",
            finishReason: "stop",
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            latencyMs: 0,
          },
          toolExecutions,
          sourceMessages,
        );
        if (earlyResponse.text.trim()) {
          return { response: earlyResponse, messages, toolExecutions };
        }
      }

      const earlyStatus = customerWantsBookingStatusByReference(sourceMessages)
        ? [...toolExecutions].reverse().find((execution) => execution.toolKey === "search_bookings")
        : null;
      if (earlyStatus?.status === "succeeded" && earlyStatus.output?.success === true) {
        const earlyResponse = applyBookingStatusReplyFallback(
          {
            text: "",
            model: input.gatewayRequest.model ?? "unknown",
            providerKey: input.gatewayRequest.providerKey ?? "unknown",
            finishReason: "stop",
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            latencyMs: 0,
          },
          toolExecutions,
          sourceMessages,
        );
        if (earlyResponse.text.trim()) {
          return { response: earlyResponse, messages, toolExecutions };
        }
      }

      const earlyCancel = [...toolExecutions]
        .reverse()
        .find((execution) => execution.toolKey === "cancel_booking");
      if (earlyCancel) {
        const earlyResponse = applyCancelBookingReplyFallback(
          {
            text: "",
            model: input.gatewayRequest.model ?? "unknown",
            providerKey: input.gatewayRequest.providerKey ?? "unknown",
            finishReason: "stop",
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            latencyMs: 0,
          },
          toolExecutions,
        );
        if (earlyResponse.text.trim()) {
          return { response: earlyResponse, messages, toolExecutions };
        }
      }

      // Bare cancel + trusted lookup completed (0 or many bookings): reply from search —
      // do not let the LLM select create_booking for "ألغي".
      if (
        isBareCancelConfirmationText(latestUserTextFromMessages(sourceMessages)) &&
        hasTrustedBookingIdentity(trustedCustomerId) &&
        hasSuccessfulSearchBookings(toolExecutions) &&
        !hasSuccessfulCancelBooking(toolExecutions)
      ) {
        const earlyResponse = applySearchBookingsReplyFallback(
          {
            text: "",
            model: input.gatewayRequest.model ?? "unknown",
            providerKey: input.gatewayRequest.providerKey ?? "unknown",
            finishReason: "stop",
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            latencyMs: 0,
          },
          toolExecutions,
          sourceMessages,
        );
        if (earlyResponse.text.trim()) {
          return { response: earlyResponse, messages, toolExecutions };
        }
      }
    }

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
      response = await this.deps.gateway.chatCompletion({
        ...input.gatewayRequest,
        messages,
        tools: input.tools,
      });

      const toolCalls = response.toolCalls ?? [];
      if (toolCalls.length === 0) {
        const pendingCustomerId = readResolvedCustomerId(
          toolExecutions,
          sourceMessages,
          trustedCustomerId,
        );
        const intakeComplete = bookingIdentityIsSatisfied(
          readPatientIntakeFromConversation(sourceMessages),
          trustedCustomerId,
        );
        if (
          pendingCustomerId &&
          intakeComplete &&
          isActiveCreateBookingTurn(sourceMessages, toolExecutions) &&
          latestUserAllowsForcedCreateBooking(sourceMessages, trustedCustomerId) &&
          !hasSuccessfulCreateBooking(toolExecutions) &&
          !hasCreateBookingAttempt(toolExecutions) &&
          iteration < MAX_TOOL_ITERATIONS - 1
        ) {
          messages.push({
            role: "assistant",
            content: response.text || "",
          });
          messages.push({
            role: "user",
            content: `CRITICAL: customerId=${pendingCustomerId}. Call create_booking immediately with this UUID and the selected date/time from the conversation. Do not call search_availability. Do not reply with waiting text such as هبدأ or لحظة.`,
          });
          continue;
        }
        if (
          bookingIdentityIsSatisfied(
            readPatientIntakeFromConversation(sourceMessages),
            trustedCustomerId,
          ) &&
          !pendingCustomerId &&
          !hasSuccessfulCreateBooking(toolExecutions) &&
          input.allowedToolKeys.includes("create_customer") &&
          !hasTrustedBookingIdentity(trustedCustomerId) &&
          iteration < MAX_TOOL_ITERATIONS - 1
        ) {
          messages.push({
            role: "assistant",
            content: response.text || "",
          });
          messages.push({
            role: "user",
            content:
              "CRITICAL: Call create_customer with the customer name and mobile from this conversation, then create_booking. Do not use search_customer on the WhatsApp sender alone.",
          });
          continue;
        }
        break;
      }

      messages.push({
        role: "assistant",
        content: response.text || "",
        toolCalls,
      });

      for (const toolCall of toolCalls) {
        if (!input.allowedToolKeys.includes(toolCall.name)) {
          messages.push({
            role: "tool",
            content: serializeRuntimeToolDenial(createToolNotAllowedDenial({ toolKey: toolCall.name })),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const schedulingIntent = resolveSchedulingOperationIntent(sourceMessages);
        if (!schedulingIntentAllowsTool(schedulingIntent, toolCall.name)) {
          messages.push({
            role: "tool",
            content: JSON.stringify({
              success: false,
              skipped: true,
              message: `Tool ${toolCall.name} is not allowed for the current customer intent (${schedulingIntent}).`,
            }),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (hasSuccessfulCreateBooking(toolExecutions) && toolCall.name === "search_availability") {
          messages.push({
            role: "tool",
            content: JSON.stringify({
              success: true,
              skipped: true,
              message: "Booking already created in this turn. Do not search availability again.",
            }),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (
          toolCall.name === "create_ticket" &&
          (latestUserWantsCreateBooking(sourceMessages) ||
            /^e2e-rt-|^idem-/i.test(latestUserTextFromMessages(sourceMessages).trim()))
        ) {
          messages.push({
            role: "tool",
            content: JSON.stringify({
              success: false,
              skipped: true,
              message: "Latest customer message is not a ticket/complaint. Do not create a ticket.",
            }),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (
          (toolCall.name === "create_booking" ||
            toolCall.name === "search_availability" ||
            toolCall.name === "find_next_available") &&
          customerWantsCreateTicket(sourceMessages)
        ) {
          messages.push({
            role: "tool",
            content: JSON.stringify({
              success: false,
              skipped: true,
              message:
                "Customer wants to open a ticket/complaint, not a booking. Do not call booking tools. Use create_ticket.",
            }),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (
          TICKET_TOOL_KEYS.has(toolCall.name) &&
          shouldDenyTicketToolsDuringBookingIntent(sourceMessages)
        ) {
          messages.push({
            role: "tool",
            content: JSON.stringify({
              success: false,
              skipped: true,
              message:
                "Customer wants to create a booking, not a ticket. Do not call ticket tools. Use search_availability / find_next_available then create_booking.",
            }),
            toolCallId: toolCall.id,
          });
          continue;
        }
        if (hasSuccessfulCreateTicket(toolExecutions) && toolCall.name === "create_ticket") {
          const existing = readSuccessfulCreateTicket(toolExecutions);
          const ticketNumber =
            typeof existing?.output?.ticketNumber === "string"
              ? existing.output.ticketNumber.trim()
              : "";
          messages.push({
            role: "tool",
            content: JSON.stringify({
              success: true,
              skipped: true,
              reused: true,
              ticketNumber: ticketNumber || undefined,
              message: ticketNumber
                ? `Ticket already created in this turn (${ticketNumber}). Tell the customer this exact number. Do not create another ticket.`
                : "Ticket already created in this turn. Do not create another ticket.",
            }),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const resolvedCustomerId = readResolvedCustomerId(
          toolExecutions,
          sourceMessages,
          trustedCustomerId,
        );

        if (
          !hasTrustedBookingIdentity(trustedCustomerId) &&
          shouldDenyBookingCustomerToolsForInvalidPhone(sourceMessages, toolExecutions) &&
          (toolCall.name === "create_booking" ||
            toolCall.name === "create_customer" ||
            toolCall.name === "search_customer")
        ) {
          messages.push({
            role: "tool",
            content: JSON.stringify({
              success: false,
              skipped: true,
              message:
                readInvalidPhoneDuringBookingIntake(sourceMessages, toolExecutions) ??
                INCOMPLETE_EGYPT_MOBILE_MESSAGE_AR,
            }),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (
          latestUserExplicitBookingLookup(sourceMessages) &&
          toolCall.name === "booking_search"
        ) {
          messages.push({
            role: "tool",
            content: JSON.stringify({
              success: false,
              skipped: true,
              message:
                "Customer wants to look up existing bookings. Call search_bookings with the registered phone instead of booking_search.",
            }),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (
          toolCall.name === "create_booking" &&
          (isFreshCreateBookingStartWithoutSlot(sourceMessages) ||
            (!hasUserSelectedBookingSlot(sourceMessages) &&
              !customerWantsCancelBooking(sourceMessages) &&
              !customerWantsRescheduleBooking(sourceMessages)))
        ) {
          messages.push({
            role: "tool",
            content: JSON.stringify({
              success: false,
              skipped: true,
              message: CREATE_BOOKING_WITHOUT_USER_SLOT_DENIAL,
            }),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (toolCall.name === "create_customer") {
          if (
            requiresBookingIntakeBeforeCustomerTools(
              sourceMessages,
              toolExecutions,
              trustedCustomerId,
            )
          ) {
            messages.push({
              role: "tool",
              content: JSON.stringify({
                success: false,
                skipped: true,
                message: BOOKING_INTAKE_TOOL_DENIAL,
              }),
              toolCallId: toolCall.id,
            });
            continue;
          }
        }

        if (toolCall.name === "create_booking") {
          if (
            requiresBookingIntakeBeforeCreateBooking(
              sourceMessages,
              toolExecutions,
              trustedCustomerId,
            )
          ) {
            messages.push({
              role: "tool",
              content: JSON.stringify({
                success: false,
                skipped: true,
                message: BOOKING_INTAKE_TOOL_DENIAL,
              }),
              toolCallId: toolCall.id,
            });
            continue;
          }
        }

        if (
          resolvedCustomerId &&
          (toolCall.name === "search_customer" || toolCall.name === "create_customer")
        ) {
          messages.push({
            role: "tool",
            content: JSON.stringify({
              success: true,
              skipped: true,
              customerId: resolvedCustomerId,
              message: "Customer already resolved. Call create_booking now with this customerId UUID.",
            }),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (toolCall.name === "search_customer") {
          if (hasTrustedBookingIdentity(trustedCustomerId)) {
            messages.push({
              role: "tool",
              content: JSON.stringify({
                success: true,
                skipped: true,
                customerId: trustedCustomerId,
                message:
                  "Trusted channel customer already resolved. Call create_booking with this customerId UUID. Do not ask for name or phone to identify them.",
              }),
              toolCallId: toolCall.id,
            });
            continue;
          }
          const intake = readPatientIntakeFromConversation(sourceMessages);
          if (
            shouldDenyBookingCustomerToolsForInvalidPhone(sourceMessages, toolExecutions) ||
            !patientIntakeIsComplete(intake)
          ) {
            messages.push({
              role: "tool",
              content: JSON.stringify({
                success: false,
                skipped: true,
                message:
                  "Customer name and mobile are not collected yet. Ask for name and mobile. Do not search by WhatsApp sender phone.",
              }),
              toolCallId: toolCall.id,
            });
            continue;
          }
          messages.push({
            role: "tool",
            content: JSON.stringify({
              success: false,
              skipped: true,
              message:
                "Patient phone is already in the conversation. Call create_customer with that exact name+phone (creates or updates CRM), then create_booking.",
            }),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (
          customerWantsFindNextAvailable(sourceMessages) &&
          (toolCall.name === "search_availability" ||
            toolCall.name === "recommend_appointment" ||
            toolCall.name === "create_booking" ||
            toolCall.name === "create_customer")
        ) {
          messages.push({
            role: "tool",
            content: JSON.stringify({
              success: false,
              skipped: true,
              message:
                "Customer asked for the nearest appointment. Call find_next_available with serviceId (and optional resourceId). Do not list multi-day availability or start booking.",
            }),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (
          customerWantsRescheduleBooking(sourceMessages) &&
          (toolCall.name === "create_booking" ||
            toolCall.name === "create_customer" ||
            toolCall.name === "cancel_booking" ||
            toolCall.name === "booking_search" ||
            toolCall.name === "search_bookings")
        ) {
          messages.push({
            role: "tool",
            content: JSON.stringify({
              success: false,
              skipped: true,
              message:
                "Customer wants to reschedule an existing booking. Call reschedule_booking with bookingReference (BK-…), date, slotStart, and phone. Do not create, cancel, or list bookings.",
            }),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (
          customerWantsCancelBooking(sourceMessages) &&
          (toolCall.name === "create_booking" ||
            toolCall.name === "search_availability" ||
            toolCall.name === "create_customer")
        ) {
          messages.push({
            role: "tool",
            content: JSON.stringify({
              success: false,
              skipped: true,
              message:
                "Cancel flow is active. Do not start a new booking. Use search_bookings purpose=cancel and cancel_booking only after the customer selects a BK- reference or list number.",
            }),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (
          toolCall.name === "search_availability" &&
          shouldSkipAvailabilityRestart(sourceMessages, toolExecutions)
        ) {
          messages.push({
            role: "tool",
            content: JSON.stringify({
              success: false,
              skipped: true,
              message:
                "Do not restart availability. Continue the pending booking: create_customer/search_customer then create_booking with a CRM UUID.",
            }),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (toolCall.name === "cancel_booking" && customerWantsRescheduleBooking(sourceMessages)) {
          messages.push({
            role: "tool",
            content: JSON.stringify({
              success: false,
              skipped: true,
              message:
                "Customer wants to reschedule, not cancel. Call search_availability if needed, then reschedule_booking with bookingReference (BK-…) and the new date/time. Do not call cancel_booking.",
            }),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (toolCall.name === "cancel_booking" && shouldBlockCancelBooking(sourceMessages, toolExecutions)) {
          messages.push({
            role: "tool",
            content: JSON.stringify({
              success: false,
              skipped: true,
              message:
                "Customer has not selected which appointment to cancel yet. Call search_bookings with purpose=cancel if needed, show the list, and ask for a list number or BK- reference. Do not cancel.",
              customerFacingMessage:
                "قولّي أنهي موعد تلغي من القائمة (رقم القائمة أو رقم الحجز مثل BK-000028).",
            }),
            toolCallId: toolCall.id,
          });
          continue;
        }

        const latestUserForCancelSelection = String(
          [...sourceMessages].reverse().find((message) => message.role === "user")?.content ?? "",
        ).trim();
        const latestUserText = latestUserForCancelSelection;
        const intake = readPatientIntakeFromConversation(sourceMessages);
        if (
          toolCall.name === "search_bookings" &&
          ticketCustomerIntakeIsComplete(intake) &&
          !customerWantsCancelBooking(sourceMessages) &&
          !customerWantsCheckInOrOut(sourceMessages) &&
          !looksLikeBookingIntent(latestUserText)
        ) {
          messages.push({
            role: "tool",
            content: JSON.stringify({
              success: false,
              skipped: true,
              message:
                "Customer is providing profile details for tickets/complaints. Do not call search_bookings. Use create_customer then ticket tools.",
            }),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (toolCall.name === "search_bookings" && customerWantsAnyTicketFlow(sourceMessages)) {
          if (latestUserWantsBookingTopic(sourceMessages)) {
            // Topic switched to booking — allow search_bookings.
          } else {
          messages.push({
            role: "tool",
            content: JSON.stringify({
              success: false,
              skipped: true,
              message:
                "Customer is asking about tickets or complaints. Do not call search_bookings. Call search_ticket instead.",
            }),
            toolCallId: toolCall.id,
          });
          continue;
          }
        }
        if (toolCall.name === "booking_search" && customerWantsAnyTicketFlow(sourceMessages)) {
          if (latestUserWantsBookingTopic(sourceMessages)) {
            // Topic switched to booking — allow booking_search.
          } else {
          messages.push({
            role: "tool",
            content: JSON.stringify({
              success: false,
              skipped: true,
              message:
                "Customer is asking about tickets or complaints. Do not call booking_search. Use ticket tools instead.",
            }),
            toolCallId: toolCall.id,
          });
          continue;
          }
        }
        if (toolCall.name === "cancel_booking" && customerWantsAnyTicketFlow(sourceMessages)) {
          if (latestUserWantsBookingTopic(sourceMessages)) {
            // Topic switched to booking cancel — allow cancel_booking.
          } else {
          messages.push({
            role: "tool",
            content: JSON.stringify({
              success: false,
              skipped: true,
              message:
                "Customer is asking about tickets or complaints. Do not call cancel_booking. Use the ticket tools instead.",
            }),
            toolCallId: toolCall.id,
          });
          continue;
          }
        }
        if (
          toolCall.name === "search_bookings" &&
          customerWantsCheckInOrOut(sourceMessages)
        ) {
          // Phase 5Q.1: do not list bookings for attendance — force check_in/out instead.
          let bookingReference: string | null = null;
          let wantsOut = false;
          for (const message of [...sourceMessages].reverse()) {
            if (message.role !== "user") continue;
            const text = String(message.content ?? "");
            if (!bookingReference) {
              const m = text.match(/\bBK-\d+\b/i);
              if (m) bookingReference = m[0].toUpperCase();
            }
            if (/تسجيل\s*انصراف|check[_\s-]?out|انصرافي|أسجل انصراف/i.test(text)) {
              wantsOut = true;
            }
          }
          if (bookingReference) {
            const phone = readPhoneForBookingSearch(sourceMessages);
            const toolKey = wantsOut ? "check_out" : "check_in";
            const routedCheck = await this.deps.tools.route(input.ctx, {
              conversationId: input.conversationId,
              toolKey,
              input: {
                bookingReference,
                ...(phone ? { phone } : {}),
              },
              triggeredBy: "agent",
            });
            toolExecutions.push({
              toolKey: routedCheck.toolKey,
              executionId: routedCheck.executionId,
              status: routedCheck.status,
              output: routedCheck.output,
              durationMs: routedCheck.durationMs,
            });
            messages.push({
              role: "tool",
              content: JSON.stringify(
                routedCheck.output ?? {
                  success: false,
                  skippedSearch: true,
                  message: `Use ${toolKey} for attendance; search_bookings was redirected.`,
                },
              ),
              toolCallId: toolCall.id,
            });
            continue;
          }
          messages.push({
            role: "tool",
            content: JSON.stringify({
              success: false,
              skipped: true,
              message:
                "Customer wants check-in/out. Do not call search_bookings. Call check_in or check_out with bookingReference (BK-…) and phone.",
            }),
            toolCallId: toolCall.id,
          });
          continue;
        }
        if (
          toolCall.name === "search_bookings" &&
          (isActiveCreateBookingTurn(sourceMessages, toolExecutions) ||
            (conversationShowsRecentBookingAvailability(sourceMessages) &&
              !customerWantsCancelBooking(sourceMessages) &&
              !latestUserExplicitBookingLookup(sourceMessages) &&
              (latestUserWantsCreateBooking(sourceMessages) ||
                isSlotPickMessage(latestUserText) ||
                parseRelativeArabicBookingSlot(latestUserText) !== null)))
        ) {
          messages.push({
            role: "tool",
            content: JSON.stringify({
              success: false,
              skipped: true,
              message:
                "Customer is creating a new booking. Do not call search_bookings. Call search_availability / find_next_available, then create_customer (if needed) and create_booking with the selected date/time and catalog serviceId/resourceId.",
            }),
            toolCallId: toolCall.id,
          });
          continue;
        }
        if (
          toolCall.name === "cancel_booking" &&
          latestUserWantsCreateBooking(sourceMessages) &&
          !customerWantsCancelBooking(sourceMessages)
        ) {
          messages.push({
            role: "tool",
            content: JSON.stringify({
              success: false,
              skipped: true,
              message:
                "Customer wants to create a new booking, not cancel. Do not call cancel_booking. Offer availability / create_booking instead.",
            }),
            toolCallId: toolCall.id,
          });
          continue;
        }
        if (
          toolCall.name === "search_bookings" &&
          customerWantsCancelBooking(sourceMessages) &&
          isCancelSelectionMessage(latestUserForCancelSelection)
        ) {
          messages.push({
            role: "tool",
            content: JSON.stringify({
              success: false,
              skipped: true,
              message:
                "Customer already selected a booking (BK- reference or list number). Do not call search_bookings again. Call cancel_booking for the selected booking.",
            }),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (toolCall.name === "create_booking" && hasCreateBookingAttempt(toolExecutions)) {
          if (hasSuccessfulCreateBooking(toolExecutions)) {
            const existing = [...toolExecutions]
              .reverse()
              .find(
                (execution) =>
                  execution.toolKey === "create_booking" &&
                  execution.status === "succeeded" &&
                  execution.output?.success === true,
              );
            messages.push({
              role: "tool",
              content: JSON.stringify({
                success: true,
                skipped: true,
                reused: true,
                bookingId: existing?.output?.bookingId,
                message:
                  "Booking already created in this turn. Tell the customer the confirmation details. Do not create another booking.",
              }),
              toolCallId: toolCall.id,
            });
          } else {
            messages.push({
              role: "tool",
              content: JSON.stringify({
                success: false,
                skipped: true,
                message:
                  "create_booking was already attempted in this turn. Do not call it again in the same turn.",
              }),
              toolCallId: toolCall.id,
            });
          }
          continue;
        }

        const routedInput =
          toolCall.name === "create_booking"
            ? rewriteCreateBookingArgs(toolCall.arguments, sourceMessages, toolExecutions, trustedCustomerId)
            : toolCall.name === "create_customer"
              ? rewriteCreateCustomerArgs(toolCall.arguments, sourceMessages)
            : toolCall.name === "search_bookings"
              ? {
                  ...toolCall.arguments,
                  // Never trust the LLM purpose flag — cancel list only when cancel intent is active.
                  purpose: customerWantsCancelBooking(sourceMessages) ? "cancel" : "list",
                }
              : toolCall.name === "cancel_booking"
                ? buildForcedCancelBookingInput(
                    sourceMessages,
                    toolExecutions,
                    toolCall.arguments ?? {},
                  )
              : toolCall.name === "reschedule_booking"
                ? rewriteRescheduleBookingArgs(toolCall.arguments, sourceMessages)
              : ["search_availability", "find_next_available", "recommend_appointment"].includes(
                    toolCall.name,
                  )
                ? rewriteSchedulingCatalogArgs(toolCall.arguments, [...sourceMessages, ...messages])
              : toolCall.name === "update_ticket"
                ? normalizeUpdateTicketInput(
                    (toolCall.arguments ?? {}) as Record<string, unknown>,
                    latestUserText,
                  )
              : toolCall.name === "check_in" || toolCall.name === "check_out"
                ? {
                    ...toolCall.arguments,
                    ...(readPhoneForBookingSearch(sourceMessages)
                      ? { phone: readPhoneForBookingSearch(sourceMessages) }
                      : {}),
                    ...(() => {
                      for (const message of [...sourceMessages].reverse()) {
                        if (message.role !== "user") continue;
                        const ref = String(message.content ?? "").match(/\bBK-\d+\b/i)?.[0];
                        if (ref) return { bookingReference: ref.toUpperCase() };
                      }
                      return {};
                    })(),
                  }
              : toolCall.arguments;

        let routed: Awaited<ReturnType<RuntimeToolPort["route"]>>;
        try {
          routed = await this.deps.tools.route(input.ctx, {
            conversationId: input.conversationId,
            toolKey: toolCall.name,
            input: routedInput,
            triggeredBy: "llm",
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Tool routing failed.";
          routed = {
            toolKey: toolCall.name,
            executionId: `route-error-${Date.now()}`,
            status: "failed",
            output: null,
            durationMs: 0,
            errorCode: "TOOL_ROUTE_THREW",
            errorMessage: message,
          };
        }

        toolExecutions.push({
          toolKey: routed.toolKey,
          executionId: routed.executionId,
          status: routed.status,
          input: (routedInput ?? null) as Record<string, unknown> | null,
          output: routed.output,
          durationMs: routed.durationMs,
        });

        // After create_customer succeeds, promote trusted identity for same-turn scheduling tools.
        if (
          toolCall.name === "create_customer" &&
          routed.status === "succeeded" &&
          routed.output?.success === true &&
          typeof routed.output.customerId === "string" &&
          isCustomerUuid(routed.output.customerId.trim())
        ) {
          trustedCustomerId = routed.output.customerId.trim();
        }

        const toolPayload =
          routed.status === "succeeded" && routed.output
            ? routed.output
            : createToolExecutionFailurePayload({
                errorCode: routed.errorCode ?? "TOOL_FAILED",
                reason: routed.errorMessage ?? "Tool execution failed.",
              });

        messages.push({
          role: "tool",
          content: JSON.stringify(toolPayload),
          toolCallId: toolCall.id,
        });
      }

      if (hasSuccessfulCreateBooking(toolExecutions)) {
        break;
      }

      if (hasSuccessfulCreateTicket(toolExecutions)) {
        break;
      }

      const availabilityOnlyRound = toolCalls.every((call) => call.name === "search_availability");
      if (
        availabilityOnlyRound &&
        (shouldSkipAvailabilityRestart(input.gatewayRequest.messages, toolExecutions) ||
          readSearchAvailabilitySummary(lastUsableAvailability(toolExecutions)?.output ?? null))
      ) {
        break;
      }
    }

    if (this.deps.tools) {
      try {
        await forceEnsureCustomerProfile({
          tools: this.deps.tools,
          ctx: input.ctx,
          conversationId: input.conversationId,
          allowedToolKeys: input.allowedToolKeys,
          sourceMessages,
          toolExecutions,
          trustedCustomerId,
        });
      } catch {
        // Ignore forced profile failures; booking path can recover next turn.
      }
      try {
        await forceCreateBookingIfReady({
          tools: this.deps.tools,
          ctx: input.ctx,
          conversationId: input.conversationId,
          allowedToolKeys: input.allowedToolKeys,
          messages,
          sourceMessages,
          toolExecutions,
          trustedCustomerId,
        });
      } catch {
        // Ignore forced booking failures; reply fallbacks handle messaging.
      }
    }

    if (
      this.deps.tools &&
      isActiveCreateBookingTurn(sourceMessages, toolExecutions) &&
      !customerWantsCancelBooking(sourceMessages) &&
      !customerWantsCreateTicket(sourceMessages) &&
      !customerWantsAnyTicketFlow(sourceMessages) &&
      latestUserAllowsForcedCreateBooking(sourceMessages, trustedCustomerId) &&
      readResolvedCustomerId(toolExecutions, sourceMessages, trustedCustomerId) &&
      bookingIdentityIsSatisfied(
        readPatientIntakeFromConversation(sourceMessages),
        trustedCustomerId,
      ) &&
      !hasSuccessfulCreateBooking(toolExecutions) &&
      !hasCreateBookingAttempt(toolExecutions) &&
      hasCanonicalBookingSlotContext(input.gatewayRequest.messages, toolExecutions)
    ) {
      const pendingCustomerId = readResolvedCustomerId(
        toolExecutions,
        sourceMessages,
        trustedCustomerId,
      );
      const canonicalSlot = readLastSuccessfulSchedulingSlot(
        input.gatewayRequest.messages,
        toolExecutions,
      );
      const selectedSlot = parseSelectedBookingSlot(input.gatewayRequest.messages, toolExecutions);
      const slotHint = canonicalSlot
        ? ` Use serviceId=${canonicalSlot.serviceId}, resourceId=${canonicalSlot.resourceId}, date=${canonicalSlot.date}, and slotStart=${canonicalSlot.slotStart}.`
        : selectedSlot
          ? ` Use date=${selectedSlot.date} and slotStart=${selectedSlot.slotStart}.`
          : " Use the selected date/time from the conversation.";
      messages.push({
        role: "user",
        content: `CRITICAL: customerId=${pendingCustomerId}. Call create_booking immediately with this UUID.${slotHint} Do not call search_availability. Do not reply with waiting text such as سأقوم الآن بحجز or لحظة.`,
      });
      response = await this.deps.gateway.chatCompletion({
        ...input.gatewayRequest,
        messages,
        tools: input.tools,
      });
      const extraBookingCalls = (response.toolCalls ?? []).filter((call) => call.name === "create_booking");
      if (extraBookingCalls.length > 0 && !hasCreateBookingAttempt(toolExecutions)) {
        messages.push({
          role: "assistant",
          content: response.text || "",
          toolCalls: response.toolCalls,
        });
        for (const toolCall of extraBookingCalls) {
          if (!input.allowedToolKeys.includes(toolCall.name)) {
            messages.push({
              role: "tool",
              content: serializeRuntimeToolDenial(createToolNotAllowedDenial({ toolKey: toolCall.name })),
              toolCallId: toolCall.id,
            });
            continue;
          }
          try {
            const routed = await this.deps.tools.route(input.ctx, {
              conversationId: input.conversationId,
              toolKey: toolCall.name,
              input: rewriteCreateBookingArgs(toolCall.arguments, sourceMessages, toolExecutions, trustedCustomerId),
              triggeredBy: "llm",
            });
            toolExecutions.push({
              toolKey: routed.toolKey,
              executionId: routed.executionId,
              status: routed.status,
              output: routed.output,
              durationMs: routed.durationMs,
            });
            const toolPayload =
              routed.status === "succeeded" && routed.output
                ? routed.output
                : createToolExecutionFailurePayload({
                    errorCode: routed.errorCode ?? "TOOL_FAILED",
                    reason: routed.errorMessage ?? "Tool execution failed.",
                  });
            messages.push({
              role: "tool",
              content: JSON.stringify(toolPayload),
              toolCallId: toolCall.id,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : "Tool routing failed.";
            messages.push({
              role: "tool",
              content: JSON.stringify(
                createToolExecutionFailurePayload({
                  errorCode: "TOOL_ROUTE_THREW",
                  reason: message,
                }),
              ),
              toolCallId: toolCall.id,
            });
          }
        }
      }
      try {
        await forceEnsureCustomerProfile({
          tools: this.deps.tools,
          ctx: input.ctx,
          conversationId: input.conversationId,
          allowedToolKeys: input.allowedToolKeys,
          sourceMessages,
          toolExecutions,
          trustedCustomerId,
        });
      } catch {
        // Ignore forced profile failures.
      }
      try {
        await forceCreateBookingIfReady({
          tools: this.deps.tools,
          ctx: input.ctx,
          conversationId: input.conversationId,
          allowedToolKeys: input.allowedToolKeys,
          messages,
          sourceMessages,
          toolExecutions,
          trustedCustomerId,
        });
      } catch {
        // Ignore forced booking failures.
      }
    }

    if (!response) {
      throw new Error("Tool call loop did not produce a gateway response.");
    }

    if (this.deps.tools) {
      try {
        await forceSearchTicketIfNeeded({
          tools: this.deps.tools,
          ctx: input.ctx,
          conversationId: input.conversationId,
          allowedToolKeys: input.allowedToolKeys,
          sourceMessages,
          toolExecutions,
          responseText: response.text,
        });
      } catch {
        // Never fail the customer reply because a forced search threw.
      }
      try {
        await forceCreateTicketIfReady({
          tools: this.deps.tools,
          ctx: input.ctx,
          conversationId: input.conversationId,
          allowedToolKeys: input.allowedToolKeys,
          sourceMessages,
          toolExecutions,
          trustedCustomerId,
        });
      } catch {
        // Never fail the customer reply because a forced ticket threw.
      }
      try {
        await forceSearchBookingsIfNeeded({
          tools: this.deps.tools,
          ctx: input.ctx,
          conversationId: input.conversationId,
          allowedToolKeys: input.allowedToolKeys,
          sourceMessages,
          toolExecutions,
          responseText: response.text,
        });
      } catch {
        // Never fail the customer reply because a forced search threw.
      }
      try {
        await forceCheckInOutIfReady({
          tools: this.deps.tools,
          ctx: input.ctx,
          conversationId: input.conversationId,
          allowedToolKeys: input.allowedToolKeys,
          sourceMessages,
          toolExecutions,
        });
      } catch {
        // Never fail the turn because forced check-in/out threw.
      }
      try {
        await forceRescheduleIfReady({
          tools: this.deps.tools,
          ctx: input.ctx,
          conversationId: input.conversationId,
          allowedToolKeys: input.allowedToolKeys,
          sourceMessages,
          toolExecutions,
          trustedCustomerId,
        });
      } catch {
        // Never fail the turn because forced reschedule threw.
      }
      try {
        await forceFindNextAvailableIfReady({
          tools: this.deps.tools,
          ctx: input.ctx,
          conversationId: input.conversationId,
          allowedToolKeys: input.allowedToolKeys,
          sourceMessages,
          toolExecutions,
        });
      } catch {
        // Never fail the turn because forced find-next threw.
      }

      try {
        await forceSearchAvailabilityIfReady({
          tools: this.deps.tools,
          ctx: input.ctx,
          conversationId: input.conversationId,
          allowedToolKeys: input.allowedToolKeys,
          sourceMessages,
          toolExecutions,
        });
      } catch {
        // Never fail the turn because forced availability search threw.
      }
      try {
        await forceCancelBookingIfSelected({
          tools: this.deps.tools,
          ctx: input.ctx,
          conversationId: input.conversationId,
          allowedToolKeys: input.allowedToolKeys,
          sourceMessages,
          toolExecutions,
        });
      } catch (error) {
        pushForcedCancelFailure(error);
      }
    }

    const bookingSucceeded = hasSuccessfulCreateBooking(toolExecutions);
    const availabilitySummary = readSearchAvailabilitySummary(
      lastUsableAvailability(toolExecutions)?.output ?? null,
    );
    const canSkipFinalCompletion =
      bookingSucceeded ||
      (Boolean(availabilitySummary) &&
        !hasCreateBookingAttempt(toolExecutions) &&
        !shouldSkipAvailabilityRestart(input.gatewayRequest.messages, toolExecutions) &&
        (!response.text.trim() || isAvailabilityPlaceholderReply(response.text)));

    if (!canSkipFinalCompletion && !response.text.trim() && toolExecutions.length > 0) {
      response = await this.deps.gateway.chatCompletion({
        ...input.gatewayRequest,
        messages,
        tools: undefined,
      });
    }

    response = applySearchAvailabilityReplyFallback(
      response,
      toolExecutions,
      input.gatewayRequest.messages,
    );
    response = applyNonMutatingFollowUpGuard(response, input.gatewayRequest.messages);
    response = applyBookingReplyFallback(response, toolExecutions, input.gatewayRequest.messages);
    response = applyTicketReplyFallback(response, toolExecutions);
    response = applyCloseTicketReplyFallback(response, toolExecutions);
    response = applyTicketSearchReplyFallback(response, toolExecutions);
    response = applyAskTicketNumberFallback(response, sourceMessages, toolExecutions);
    response = applySearchBookingsReplyFallback(response, toolExecutions, sourceMessages);
    response = applyBookingStatusReplyFallback(response, toolExecutions, sourceMessages);
    response = applyCancelBookingReplyFallback(response, toolExecutions);
    response = applyCheckInOutReplyFallback(response, toolExecutions);
    response = applyRescheduleBookingReplyFallback(response, toolExecutions);
    response = applyRescheduleTopicGuard(response, sourceMessages, toolExecutions);
    response = applyFindNextAvailableReplyFallback(response, toolExecutions, sourceMessages);
    response = applyAskBookingPhoneFallback(response, sourceMessages, toolExecutions, trustedCustomerId);

    // Trusted WhatsApp identity: never re-ask name/phone — including cancel/check-in/reschedule turns.
    // Do not rewrite a successful booking confirmation into the "choose a slot" continue message.
    if (hasTrustedBookingIdentity(trustedCustomerId) && !hasSuccessfulCreateBooking(toolExecutions)) {
      const normalizedTrusted = normalizePatientIntakeReply(
        response.text,
        input.gatewayRequest.messages,
        toolExecutions,
        trustedCustomerId,
      );
      if (normalizedTrusted !== response.text.trim()) {
        response = {
          ...response,
          text: normalizedTrusted,
          finishReason: response.finishReason ?? "stop",
        };
      }
    } else if (
      !customerWantsCancelBooking(sourceMessages) &&
      !customerWantsCheckInOrOut(sourceMessages) &&
      !customerWantsRescheduleBooking(sourceMessages) &&
      !customerWantsRecommendationOrAvailability(sourceMessages)
    ) {
      const normalizedReply = normalizePatientIntakeReply(
        response.text,
        input.gatewayRequest.messages,
        toolExecutions,
        trustedCustomerId,
      );
      if (normalizedReply !== response.text.trim()) {
        response = {
          ...response,
          text: normalizedReply,
          finishReason: response.finishReason ?? "stop",
        };
      }

      if (
        !response.text.trim() &&
        hasUserSelectedBookingSlot(input.gatewayRequest.messages, toolExecutions) &&
        !bookingIdentityIsSatisfied(
          readPatientIntakeFromConversation(input.gatewayRequest.messages),
          trustedCustomerId,
        )
      ) {
        response = {
          ...response,
          text: bookingIntakePromptForMessages(input.gatewayRequest.messages, toolExecutions),
          finishReason: response.finishReason ?? "stop",
        };
      }

      if (
        requiresBookingIntakeBeforeCustomerTools(
          input.gatewayRequest.messages,
          toolExecutions,
          trustedCustomerId,
        ) &&
        !hasSuccessfulCreateBooking(toolExecutions) &&
        !customerWantsCreateTicket(sourceMessages) &&
        !customerWantsAnyTicketFlow(sourceMessages) &&
        !/اسم (?:المريض|العميل)/.test(response.text)
      ) {
        response = {
          ...response,
          text: bookingIntakePromptForMessages(input.gatewayRequest.messages, toolExecutions),
          finishReason: response.finishReason ?? "stop",
        };
      }
    }

    if (latestUserExplicitBookingLookup(sourceMessages)) {
      const lookupPhoneReply = EXPLICIT_BOOKING_LOOKUP_PHONE_REPLY;
      if (
        !hasTrustedBookingIdentity(trustedCustomerId) &&
        !hasSuccessfulSearchBookings(toolExecutions) &&
        !readPhoneForBookingSearch(sourceMessages) &&
        !response.text.includes(lookupPhoneReply)
      ) {
        response = {
          ...response,
          text: lookupPhoneReply,
          finishReason: response.finishReason ?? "stop",
        };
      }
    }

    if (
      customerWantsCancelBooking(sourceMessages) &&
      isCancelSelectionMessage(
        String(
          [...sourceMessages].reverse().find((message) => message.role === "user")?.content ?? "",
        ).trim(),
      ) &&
      !hasSuccessfulCancelBooking(toolExecutions) &&
      !response.text.trim()
    ) {
      response = {
        ...response,
        text: "ما قدرت ألغي الموعد ده. ابعتي رقم القائمة أو رقم الحجز (مثل BK-000028) تاني.",
        finishReason: response.finishReason ?? "stop",
      };
    }

    return { response, messages, toolExecutions };
  }

  async runWithOptionalStreaming(
    input: ToolCallLoopInput & { onStreamChunk?: (chunk: string) => void },
  ): Promise<ToolCallLoopResult> {
    const loopResult = await this.run(input);

    if (
      !input.onStreamChunk ||
      !this.deps.gateway.streamChatCompletion ||
      input.tools.length === 0
    ) {
      return loopResult;
    }

    if (loopResult.toolExecutions.length === 0) {
      if (loopResult.response.text) {
        input.onStreamChunk(loopResult.response.text);
      }
      return loopResult;
    }

    if (loopResult.response.text.trim()) {
      input.onStreamChunk(loopResult.response.text);
      return loopResult;
    }

    let streamedText = "";
    for await (const event of this.deps.gateway.streamChatCompletion({
      ...input.gatewayRequest,
      messages: loopResult.messages,
      tools: undefined,
    })) {
      if (event.type === "delta" && event.delta) {
        streamedText += event.delta;
        input.onStreamChunk(event.delta);
      }
    }

    if (streamedText.trim()) {
      loopResult.response = { ...loopResult.response, text: streamedText };
    }

    return loopResult;
  }
}

export function mapGatewayToolCalls(toolCalls?: ChatToolCall[]) {
  return toolCalls?.map((call) => ({
    id: call.id,
    name: call.name,
    arguments: call.arguments,
  }));
}
