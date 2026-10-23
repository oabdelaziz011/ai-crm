import type { ChatToolCall } from "@workspace/ai-provider-layer";
import {
  convertArabicDigitsToAscii,
  extractPhoneFromCustomerText,
  formatArabicTime12h,
  formatArabicWeekdayDate,
  INCOMPLETE_EGYPT_MOBILE_MESSAGE_AR,
  looksLikeCalendarDateDigits,
  normalizeEgyptMobilePhone,
  validateEgyptMobilePhone,
  extractSingleEgyptianMobileE164,
  extractPurchaseContact,
  messageHasExplicitPurchase,
} from "@workspace/ai-tool-router";
import {
  customerRequestedProductPhotos,
  foldCatalogText,
  looksLikeProductRecommendationTurn,
  customerOptedOutOfRecommendations,
  recommendFromCatalog,
  normalizeUpdateTicketInput,
  omitProductDeliveryImages,
  PRODUCT_DETAILS_MAX_IDS,
} from "@workspace/ai-tool-router";
import type { RuntimeGatewayPort, RuntimeGatewayChatRequest, RuntimeGatewayChatResponse } from "../ports/runtime-ports.js";
import type { RuntimeToolPort } from "../ports/runtime-ports.js";
import type { ServiceContext } from "../types.js";
import { reconcileUnverifiedCustomerClaims } from "./customer-claim-guard.js";
import {
  guardUnverifiedQuoteClaims,
  hasVerifiedBusinessOutcome,
  isRecoverableProviderFailure,
  summarizeSalesToolOutcome,
  toolCallSignature,
  type SalesFallbackLanguage,
} from "./sales-tool-outcome.js";
import { detectCustomerLanguage } from "./customer-language.js";
import {
  createToolExecutionFailurePayload,
  createToolNotAllowedDenial,
  serializeRuntimeToolDenial,
} from "./runtime-tool-denial-factory.js";
import {
  customerWantsBookingStatusByReference,
  customerWantsBookingStatusFromText,
  extractBookingReference,
  formatBookingStatusReply,
  isNonMutatingFollowUpMessage,
  resolveSchedulingOperationIntent,
  schedulingIntentAllowsTool,
  shouldInvalidatePriorSchedulingSeed,
} from "./scheduling-operation-intent.js";
import {
  arabicCatalogWordStem,
  detectProductTypeIntent,
  isProductTypeAlias,
  looksLikeCompanyIntroQuestion,
  looksLikeCurrentCatalogFactQuestion,
  looksLikeProductCatalogQuestion,
  productTypeChatDef,
  type ProductTypeChatCode,
} from "./product-type-chat.js";
import { trySalesConversationTurn } from "./sales-conversation-turn.js";

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
  const lines = [...timesByDate.entries()].map(
    ([date, times]) => `- ${date}: ${times.slice(0, 6).map((time) => formatArabicTime12h(time)).join(", ")}`,
  );
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

const RESCHEDULE_ASK_SLOT_MESSAGES = {
  ar: "تمام، عشان نغيّر الميعاد ابعتي اليوم والساعة الجديدة (مثل 24-08-2026 الساعة 08:00).",
  en: "To change the time, send the new day and time (for example 24-08-2026 at 08:00).",
  de: "Um den Termin zu verschieben, sende den neuen Tag und die Uhrzeit (zum Beispiel 24-08-2026 um 08:00).",
} as const;

const RESCHEDULE_ASK_BOOKING_REF_MESSAGES = {
  ar: "ابعتي رقم الحجز اللي عايزة تغيّري ميعاده (مثل BK-000026).",
  en: "Send the booking number you want to reschedule (for example BK-000026).",
  de: "Sende die Buchungsnummer, deren Termin du verschieben möchtest (zum Beispiel BK-000026).",
} as const;

const RESCHEDULE_ASK_PHONE_MESSAGES = {
  ar: "محتاجين رقم موبايل العميل عشان نأكد ملكية الحجز قبل تغيير الميعاد.",
  en: "I need the customer's mobile number to confirm booking ownership before changing the time.",
  de: "Ich brauche die Mobilnummer des Kunden, um die Buchung vor dem Verschieben zu bestätigen.",
} as const;

const RESCHEDULE_ASK_SLOT_MESSAGE = RESCHEDULE_ASK_SLOT_MESSAGES.ar;
const RESCHEDULE_ASK_BOOKING_REF_MESSAGE = RESCHEDULE_ASK_BOOKING_REF_MESSAGES.ar;
const RESCHEDULE_ASK_PHONE_MESSAGE = RESCHEDULE_ASK_PHONE_MESSAGES.ar;

function rescheduleAskSlot(language: CustomerReplyLanguage): string {
  return RESCHEDULE_ASK_SLOT_MESSAGES[language];
}

function rescheduleAskBookingRef(language: CustomerReplyLanguage): string {
  return RESCHEDULE_ASK_BOOKING_REF_MESSAGES[language];
}

function rescheduleAskPhone(language: CustomerReplyLanguage): string {
  return RESCHEDULE_ASK_PHONE_MESSAGES[language];
}

function assistantAskedRescheduleReference(text: string): boolean {
  return Object.values(RESCHEDULE_ASK_BOOKING_REF_MESSAGES).some((prompt) => text.includes(prompt));
}

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
  const language = customerReplyLanguage(messages);
  if (intake?.phone?.trim()) {
    const validation = validateEgyptMobilePhone(intake.phone);
    if (!validation.valid && validation.reason === "incomplete") {
      return bookingPhoneProblem(language, "incomplete");
    }
    if (!validation.valid && validation.reason === "invalid_prefix") {
      return bookingPhoneProblem(language, "prefix");
    }
  }
  const incomplete = readIncompletePhoneAttemptFromLatestUser(messages);
  if (!incomplete) return null;
  return language === "ar" ? incomplete : bookingPhoneProblem(language, "incomplete");
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

function bookingPhoneProblem(
  language: CustomerReplyLanguage,
  kind: "incomplete" | "prefix",
): string {
  if (language === "en") {
    return kind === "incomplete"
      ? "That mobile number looks incomplete. Please send the full number."
      : "That mobile number is not valid. Please send a valid mobile number.";
  }
  if (language === "de") {
    return kind === "incomplete"
      ? "Die Mobilnummer ist unvollständig. Bitte senden Sie die vollständige Nummer."
      : "Die Mobilnummer ist ungültig. Bitte senden Sie eine gültige Mobilnummer.";
  }
  return kind === "incomplete"
    ? INCOMPLETE_EGYPT_MOBILE_MESSAGE_AR
    : "رقم الموبايل غير صحيح. من فضلك اكتب رقم موبايل مصري صحيح.";
}

function bookingIntakeCopy(language: CustomerReplyLanguage): {
  both: string;
  name: string;
  full: string;
  phone: string;
} {
  if (language === "en") {
    return {
      both: "I need the customer's full name and mobile number to continue the booking. Please send both.",
      name: "I need the customer's name to continue the booking. Please send the name.",
      full: "I need the customer's full name, not only the first name. Please send the full name.",
      phone: "I need the customer's mobile number to continue the booking. Please send it.",
    };
  }
  if (language === "de") {
    return {
      both: "Ich brauche den vollständigen Namen und die Mobilnummer des Kunden, um die Buchung fortzusetzen. Bitte senden Sie beides.",
      name: "Ich brauche den Namen des Kunden, um die Buchung fortzusetzen. Bitte senden Sie den Namen.",
      full: "Ich brauche den vollständigen Namen des Kunden, nicht nur den Vornamen. Bitte senden Sie den vollständigen Namen.",
      phone: "Ich brauche die Mobilnummer des Kunden, um die Buchung fortzusetzen. Bitte senden Sie sie.",
    };
  }
  return {
    both: BOOKING_INTAKE_MESSAGE,
    name: BOOKING_INTAKE_NAME_MESSAGE,
    full: BOOKING_INTAKE_FULL_NAME_MESSAGE,
    phone: BOOKING_PHONE_INTAKE_MESSAGE,
  };
}

function bookingIntakeMessage(
  intake: PatientIntake | null,
  messages: RuntimeGatewayChatRequest["messages"] = [],
  toolExecutions: ToolCallLoopResult["toolExecutions"] = [],
): string {
  const invalidPhone = readInvalidBookingPhoneMessage(intake, messages);
  if (invalidPhone) return invalidPhone;
  const copy = bookingIntakeCopy(customerReplyLanguage(messages));
  if (
    hasUserSelectedBookingSlot(messages, toolExecutions) &&
    !patientIntakeIsComplete(intake)
  ) {
    if (intake?.phone?.trim() && !intake.name?.trim()) return copy.name;
    if (intake?.name?.trim() && !isCompleteCustomerFullName(intake.name)) {
      return copy.full;
    }
    if (intake?.name?.trim() && !intake.phone?.trim()) return copy.phone;
    return copy.both;
  }
  if (intake?.name?.trim() && !isCompleteCustomerFullName(intake.name)) {
    return copy.full;
  }
  if (intake?.name?.trim() && !intake.phone?.trim()) return copy.phone;
  if (intake?.phone?.trim() && !intake.name?.trim()) return copy.name;
  return copy.both;
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
  const trimmed = value
    .trim()
    .replace(/[!.,،?؟…]+$/gu, "")
    .trim();
  if (!trimmed) return false;
  return /^(?:هاي|هااي|هلا|أهل[اً]|اهلا|مرحبا|مرحبًا|hi|hello|hey|yes|ok|okay|أ?يوه|ايوه|تمام|ماشي|thanks|thank you|شكرا|شكرًا|شكراً|متشكر|تسلم|سلام|السلام عليكم|(?:صباح|مساء)\s*(?:الخير|النور|الفل|الورد)|ازيك|إزيك|ازيّك|إزيّك|عامل(?:ة)?\s+ايه|كيفك|كيف حالك|اخبارك|أخبارك)(?:\s+يا\s+\S+)?$/iu.test(
    trimmed,
  );
}

function stripTrailingChatPunctuation(value: string): string {
  return value
    .trim()
    .replace(/[!.,،?؟…]+$/gu, "")
    .trim();
}

/**
 * Asking who provides the services. The role word is whatever the company stored
 * (doctor, employee, therapist, …), not a fixed "دكاترة".
 * A booking verb in the same message stays a booking turn.
 */
function looksLikeProviderRosterQuestion(value: string): boolean {
  const trimmed = stripTrailingChatPunctuation(value);
  if (!trimmed || looksLikeCasualReply(trimmed)) return false;
  if (/(?:احجز|أحجز|هحجز|حجز|ميعاد|موعد|book)/iu.test(trimmed)) return false;
  return /(?:اسماء|أسماء|اسم|مين|مَين|who).{0,48}(?:دكتور|دكاتر|طبيب|أطباء|اطباء|استاذ|أستاذ|اساتذ|أساتذ|مهندس|مقدم|موظف|معالج|instructor|engineer|doctor|provider|resource)|(?:الدكاتر|الأطباء|الاطباء|الأساتذ|الاساتذ|المهندس|مقدم[وي]\s+الخدم|اللي\s+بيقدم|الذين\s+يقدم)/iu.test(
    trimmed,
  );
}

/** Asking which services exist. A booking verb in the same message stays a booking turn. */
function looksLikeServiceCatalogQuestion(value: string): boolean {
  const trimmed = stripTrailingChatPunctuation(value);
  if (!trimmed || looksLikeCasualReply(trimmed)) return false;
  if (looksLikeProviderRosterQuestion(trimmed)) return false;
  if (looksLikeCompanyIntroQuestion(trimmed)) return false;
  // "منتجاتك / المنتجات" must never pivot to scheduling service lists.
  if (
    looksLikeProductCatalogIntroQuestion(trimmed) ||
    /(?:المنتجات|منتجاتكم|منتجاتنا|منتجاتك|منتجاتكو|منتجات|كتالوج|products?\b)/iu.test(trimmed)
  ) {
    return false;
  }
  if (/(?:احجز|أحجز|هحجز|حجز|ميعاد|موعد|book)/iu.test(trimmed)) return false;
  return /(?:الخدمات|خدماتكم|الخدمه|الخدمة|\bservices\b)/iu.test(trimmed);
}

const PRICE_TYPE_CHOICE_PROMPT = "تحب سعر أنهي نوع وفي أنهي خدمة؟";

function looksLikePriceQuestion(value: string): boolean {
  const trimmed = stripTrailingChatPunctuation(value);
  if (!trimmed || looksLikeCasualReply(trimmed)) return false;
  if (/(?:احجز|أحجز|هحجز|حجز|ميعاد|موعد|book)/iu.test(trimmed)) return false;
  const folded = foldCatalogText(trimmed);
  return /(?:سعر|اسعار|أسعار|سعرو|سعره|تسعير|بكام|بكم|تكلف|ثمن|\bprices?\b|\bpreis(?:e|es)?\b|\bkostet\b|\bcost\b|how much)/iu.test(
    `${trimmed}\n${folded}`,
  );
}

function assistantAskedPriceChoice(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  return (
    typeof lastAssistant?.content === "string" &&
    (lastAssistant.content.includes("تحب سعر") ||
      lastAssistant.content.includes("كشف جديد ولا استشارة"))
  );
}

function looksLikeSchedulingInfoQuestion(
  value: string,
  messages?: RuntimeGatewayChatRequest["messages"],
): boolean {
  return (
    looksLikeServiceCatalogQuestion(value) ||
    looksLikeProviderRosterQuestion(value) ||
    looksLikePriceQuestion(value) ||
    companyContactKind(value) !== null ||
    customerWantsHumanAgent(value) ||
    (messages ? looksLikePriceFollowUp(messages) : false)
  );
}

/** Customer asked to talk to a person, not to book a slot. */
export function customerWantsHumanAgent(value: string): boolean {
  const trimmed = stripTrailingChatPunctuation(value);
  if (!trimmed || looksLikeCasualReply(trimmed)) return false;
  if (/(?:احجز|أحجز|أقرب\s*موعد|أقرب\s*ميعاد)/iu.test(trimmed)) return false;
  if (
    /(?:دكتور|طبيب|استاذ|أستاذ)/iu.test(trimmed) &&
    !/(?:خدم[ةه]\s*العملا|دعم)/iu.test(trimmed)
  ) {
    return false;
  }
  if (/(?:حوّ?ل\s*(?:ال)?(?:موعد|ميعاد|حجز))/iu.test(trimmed)) return false;
  if (/(?:^|\s)ل?(?:[اأإآ])?ل?مدير(?:\s|$)|(?:^|\s)manager(?:\s|$)/iu.test(trimmed)) return true;
  return (
    /(?:خدم[ةه]\s*العملا|ممثل(?:\s+ال)?\s*دعم|دعم\s*فني|موظف\s*(?:بشري|دعم)|customer\s*service|human\s*agent|speak\s+to\s+(?:a\s+)?(?:human|agent|person)|talk\s+to\s+(?:a\s+)?(?:human|agent|person|support)|mitarbeiter|mit einem menschen)/iu.test(
      trimmed,
    ) ||
    /(?:اتكلم|أكلم|اكلم|كلّم|كلم)\s+.{0,24}(?:خدم|دعم|موظف|agent|human)/iu.test(trimmed) ||
    /(?:حوّ?ل(?:ني|وني)|حولي|وصلني)(?:\s|$)/iu.test(trimmed)
  );
}

/** Short ping while a transfer is already in progress. Vague "فين" stays on that wait. */
export function customerContinuesHumanWait(
  latest: string,
  messages: Array<{ role: string; content?: unknown }>,
): boolean {
  if (customerWantsHumanAgent(latest)) return true;
  const trimmed = stripTrailingChatPunctuation(latest);
  if (!trimmed || trimmed.length > 40) return false;
  if (/(?:لوكيشن|عنوان|خريط|موعد|ميعاد|حجز|تليفون|تلفون|هاتف|موبايل)/iu.test(trimmed)) return false;
  const ping =
    /^(?:فين|فينه|وين|ليه|ليش|امتى|إمتى|امتي|طيب|خلاص|يا\s*عم|لسه|لسة|لسا|حد|هين|مستني|فيه)(?:\s+\S+){0,3}$/iu.test(
      trimmed,
    );
  if (!ping) return false;
  const users = messages.filter((message) => message.role === "user");
  const priorUsers = users.slice(0, -1).slice(-3);
  const asked = priorUsers.some((message) => customerWantsHumanAgent(String(message.content ?? "")));
  const waiting = messages.some(
    (message) =>
      message.role === "assistant" &&
      /جاري تحويلك|تم تسجيل طلبك|قائمة الانتظار/u.test(String(message.content ?? "")),
  );
  return asked || waiting;
}

export type CompanyContactKind = "location" | "address" | "phone" | "hours";

/** Customer asked for the place, address, phone, or hours — not a booking slot. */
export function companyContactKind(value: string): CompanyContactKind | null {
  const trimmed = stripTrailingChatPunctuation(value);
  if (!trimmed || looksLikeCasualReply(trimmed)) return null;
  if (/(?:احجز|أحجز|حجز\s*موعد|أقرب\s*موعد|أقرب\s*ميعاد)/iu.test(trimmed)) return null;
  if (/(?:لوكيشن|اللوكيشن|الخريط|خريط(?:ة|ه)|\blocation\b|\bmaps\b)/iu.test(trimmed)) return "location";
  if (/(?:عنوان|العنوان|\baddress\b)/iu.test(trimmed)) return "address";
  if (/(?:تليفون|تلفون|هاتف|موبايل|موبيل|\bphone\b|رقم\s*(?:ال)?(?:تليفون|تلفون|هاتف|موبايل|موبيل))/iu.test(trimmed)) {
    // The customer's own number inside a purchase is not a request for the support phone.
    const suppliesOwnNumber =
      /(?:موبايل|موبيل|تليفون|تلفون|هاتف|phone)\s*[:：]?\s*\+?\d[\d\s-]{6,}/iu.test(trimmed);
    const buying =
      /(?:أشتري|اشتري|هشتري|عايز\s*أشتري|buy|purchase|kaufen|عرض\s*سعر)/iu.test(trimmed) &&
      /\d{8,}/.test(trimmed);
    if (suppliesOwnNumber || buying) return null;
    return "phone";
  }
  if (/(?:ساعات\s*(?:العمل|الدعم)|مواعيد\s*العمل)/iu.test(trimmed)) return "hours";
  return null;
}

function cleanHttpUrl(raw: string): string {
  return raw.replace(/[),.،؛!؟]+$/u, "").replace(/\s+/g, "");
}

function companyFactsBlob(messages: RuntimeGatewayChatRequest["messages"]): string {
  return messages
    .filter((message) => message.role === "system")
    .map((message) => String(message.content ?? ""))
    .join("\n");
}

function mapsUrlFromFacts(blob: string): string | null {
  const labeled = /(?:لوكيشن|اللوكيشن|الموقع|الخريطة)\s*[:：]\s*(https?:\/\/\S+)/iu.exec(blob)?.[1];
  if (labeled) return cleanHttpUrl(labeled);
  const maps = /https?:\/\/(?:www\.)?(?:google\.com\/maps|maps\.app\.goo\.gl|goo\.gl\/maps)\S*/iu.exec(blob)?.[0];
  return maps ? cleanHttpUrl(maps) : null;
}

function addressFromFacts(blob: string): string | null {
  const line = /العنوان\s*[:：]\s*(.+)/iu.exec(blob)?.[1]?.split("\n")[0]?.trim() ?? "";
  return line.replace(/\s*https?:\/\/\S+/u, "").trim() || null;
}

function phoneFromFacts(blob: string): string | null {
  const line =
    /(?:موبايل|موبيل|تليفون|تلفون|هاتف)(?:\s*الدعم)?\s*[:：]\s*(\+?\d[\d\s-]{2,})/iu.exec(blob)?.[1]?.trim() ??
    "";
  return line || null;
}

function hoursFromFacts(blob: string): string | null {
  const line = /ساعات[^\n:]{0,24}[:：]\s*(.+)/iu.exec(blob)?.[1]?.split("\n")[0]?.trim() ?? "";
  return line || null;
}

const SUPPORT_DAY_INDEX: Record<string, number> = {
  sunday: 0,
  الأحد: 0,
  الاحد: 0,
  monday: 1,
  الاثنين: 1,
  الإثنين: 1,
  tuesday: 2,
  الثلاثاء: 2,
  wednesday: 3,
  الأربعاء: 3,
  الاربعاء: 3,
  thursday: 4,
  الخميس: 4,
  friday: 5,
  الجمعة: 5,
  saturday: 6,
  السبت: 6,
};

function supportDayIndex(token: string): number | null {
  const key = token.replace(/[،,.]/gu, "").trim();
  return SUPPORT_DAY_INDEX[key] ?? SUPPORT_DAY_INDEX[key.toLowerCase()] ?? null;
}

function supportClockMinutes(hourRaw: string, minuteRaw: string | undefined, meridiem: string | undefined): number | null {
  let hour = Number(hourRaw);
  const minute = minuteRaw ? Number(minuteRaw) : 0;
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 24 || minute > 59) return null;
  const marker = meridiem ?? "";
  if (/مساء/u.test(marker) && hour < 12) hour += 12;
  if (/صباح/u.test(marker) && hour === 12) hour = 0;
  return hour * 60 + minute;
}

type SupportWindow = { startDay: number; endDay: number; startMin: number; endMin: number };

function parseSupportWindow(line: string): SupportWindow | null {
  const days = /من\s+(\S+)\s+(?:إلى|الى|إلي|ل)\s+(\S+)/u.exec(line);
  const startDay = days ? supportDayIndex(days[1] ?? "") : null;
  const endDay = days ? supportDayIndex(days[2] ?? "") : null;
  const clocks = [...line.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(صباح(?:ًا|اً|ا)?|مساء(?:ًا|اً|ا)?)?/gu)];
  const start = clocks[0] ? supportClockMinutes(clocks[0][1] ?? "", clocks[0][2], clocks[0][3]) : null;
  const end = clocks[1] ? supportClockMinutes(clocks[1][1] ?? "", clocks[1][2], clocks[1][3]) : null;
  if (startDay == null || endDay == null || start == null || end == null) return null;
  return { startDay, endDay, startMin: start, endMin: end };
}

function dayFallsInSupportRange(day: number, startDay: number, endDay: number): boolean {
  if (startDay <= endDay) return day >= startDay && day <= endDay;
  return day >= startDay || day <= endDay;
}

/** Support hours written in توجيه النظام. Unparseable hours stay open so a queue can still take the chat. */
export function supportHoursAreOpen(blob: string, now: Date = new Date(), timeZone = "Africa/Cairo"): boolean {
  const line = hoursFromFacts(blob);
  const window = line ? parseSupportWindow(line) : null;
  if (!window) return true;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const day = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[weekday];
  if (day == null || !dayFallsInSupportRange(day, window.startDay, window.endDay)) return false;
  let hour = Number(parts.find((part) => part.type === "hour")?.value ?? "");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "");
  if (hour === 24) hour = 0;
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return true;
  const current = hour * 60 + minute;
  return current >= window.startMin && current <= window.endMin;
}

export function humanSupportClosedReply(messages: RuntimeGatewayChatRequest["messages"]): string {
  const hours = hoursFromFacts(companyFactsBlob(messages))?.trim().replace(/[.]+$/u, "") ?? "";
  const language = customerReplyLanguage(messages);
  if (language === "en") {
    return hours
      ? `Customer support is available ${hours}. I did not transfer this chat.`
      : "Customer support is closed right now. I did not transfer this chat.";
  }
  if (language === "de") {
    return hours
      ? `Der Kundenservice ist erreichbar: ${hours}. Ich habe diesen Chat nicht übergeben.`
      : "Der Kundenservice ist gerade geschlossen. Ich habe diesen Chat nicht übergeben.";
  }
  return hours ? `خدمة العملاء متاحة ${hours}. محوّلتش المحادثة.` : "خدمة العملاء مش متاحة دلوقتي. محوّلتش المحادثة.";
}

const HUMAN_TRANSFER_WAIT = "برجاء الانتظار جاري تحويلك لموظف خدمة العملاء";
const HUMAN_BUSY_WAIT =
  "نعتذر لحضرتك، جميع موظفي خدمة العملاء مشغولون حاليًا. تم تسجيل طلبك، وسيقوم أحد موظفينا بالتواصل معك في أقرب وقت ممكن. برجاء الانتظار، وشكرًا لتفهمك.";
const HUMAN_WAIT_FOLLOW_UP =
  "طلب حضرتك لسه في قائمة الانتظار، وهيتم تحويل المحادثة لأحد الموظفين بمجرد توفره. شكرًا لصبرك.";

/** Reply from the employee system prompt. Location links stay on their own line. */
export function companyContactReply(
  messages: RuntimeGatewayChatRequest["messages"],
): string | null {
  const kind = companyContactKind(latestUserTextFromMessages(messages));
  if (!kind) return null;
  const blob = companyFactsBlob(messages);
  const url = mapsUrlFromFacts(blob);
  if (kind === "location") {
    return url ? `اللوكيشن:\n${url}` : "اللوكيشن مش متسجل في توجيه النظام.";
  }
  if (kind === "address") {
    const address = addressFromFacts(blob);
    const lines = [address ? `العنوان: ${address}` : "", url ?? ""].filter(Boolean);
    return lines.length > 0 ? lines.join("\n") : "العنوان مش متسجل في توجيه النظام.";
  }
  if (kind === "phone") {
    const phone = phoneFromFacts(blob);
    return phone ? `رقم التليفون: ${phone}` : "رقم التليفون مش متسجل في توجيه النظام.";
  }
  const hours = hoursFromFacts(blob);
  return hours ? `ساعات العمل: ${hours}` : null;
}

function listSchedulingServiceNames(
  messages: RuntimeGatewayChatRequest["messages"],
): string[] {
  const catalogBlob = messages.map((message) => String(message.content ?? "")).join("\n");
  const names: string[] = [];
  const seen = new Set<string>();
  const pattern = /-\s*([^:\n]+?)\s*:\s*serviceId=[0-9a-f-]{36}/gi;
  let match: RegExpExecArray | null = pattern.exec(catalogBlob);
  while (match) {
    const name = match[1]?.trim();
    const key = name ? normalizeSchedulingCatalogLabel(name) : "";
    if (name && key && !seen.has(key)) {
      seen.add(key);
      names.push(name);
    }
    match = pattern.exec(catalogBlob);
  }
  return names;
}

function formatCatalogAmount(amount: string, currency: string): string {
  const unit = currency === "EGP" ? "جنيه" : currency === "USD" ? "دولار" : currency;
  return `${amount} ${unit}`;
}

type CatalogPriceRow = {
  service: string;
  kind: string;
  label: string;
  amount: string;
  currency: string;
};

function listSchedulingPrices(
  messages: RuntimeGatewayChatRequest["messages"],
): CatalogPriceRow[] {
  const catalogBlob = messages.map((message) => String(message.content ?? "")).join("\n");
  const rows: CatalogPriceRow[] = [];
  const pattern =
    /-\s*service=(.+?)\s+kind=(\S+)\s+label=(.+?)\s+amount=([0-9]+(?:\.[0-9]+)?)\s+currency=([A-Za-z]{3})/gi;
  let match: RegExpExecArray | null = pattern.exec(catalogBlob);
  while (match) {
    const service = match[1]?.trim();
    const kind = match[2]?.trim();
    const label = match[3]?.trim();
    const amount = match[4]?.trim();
    const currency = match[5]?.trim().toUpperCase();
    if (service && kind && label && amount && currency && Number(amount) > 0) {
      rows.push({ service, kind, label, amount, currency });
    }
    match = pattern.exec(catalogBlob);
  }
  return rows;
}

function rowsMatchingPriceText(value: string, rows: CatalogPriceRow[]): CatalogPriceRow[] {
  const trimmed = stripTrailingChatPunctuation(value);
  if (!trimmed || rows.length === 0) return [];
  const normalized = normalizeSchedulingCatalogLabel(trimmed);
  const serviceHits = rows.filter((row) => {
    const name = normalizeSchedulingCatalogLabel(row.service);
    return name.length >= 2 && normalized.includes(name);
  });
  let typeHits = rows.filter((row) => {
    const label = normalizeSchedulingCatalogLabel(row.label);
    const kind = normalizeSchedulingCatalogLabel(row.kind);
    if (label.length >= 2 && (normalized === label || normalized.includes(label))) return true;
    return kind.length >= 2 && normalized === kind;
  });
  if (/كشف\s*جديد/u.test(trimmed)) {
    typeHits = rows.filter((row) => row.kind.toLowerCase() === "new");
  } else if (/استشار/u.test(trimmed)) {
    const consultation = rows.filter((row) => row.kind.toLowerCase() === "consultation");
    if (consultation.length > 0) typeHits = consultation;
  }
  if (serviceHits.length > 0 && typeHits.length > 0) {
    const both = rows.filter((row) => serviceHits.includes(row) && typeHits.includes(row));
    if (both.length > 0) return both;
  }
  if (serviceHits.length > 0) return serviceHits;
  return typeHits;
}

function priceChoiceLines(rows: CatalogPriceRow[]): string {
  return rows.map((row) => `- ${row.service} (${row.label})`).join("\n");
}

function singlePriceReply(row: CatalogPriceRow): string {
  return `سعر ${row.service} (${row.label}): ${formatCatalogAmount(row.amount, row.currency)}`;
}

function looksLikePriceFollowUp(messages: RuntimeGatewayChatRequest["messages"]): boolean {
  const latest = latestUserTextFromMessages(messages);
  if (!latest || looksLikeCasualReply(latest)) return false;
  if (/(?:احجز|أحجز|هحجز|حجز|ميعاد|موعد|book)/iu.test(latest)) return false;
  if (!assistantAskedPriceChoice(messages)) return false;
  return rowsMatchingPriceText(latest, listSchedulingPrices(messages)).length > 0;
}

function priceChoiceReply(rows: CatalogPriceRow[]): string {
  if (rows.length === 1) return singlePriceReply(rows[0]!);
  const services = [...new Set(rows.map((row) => row.service))];
  const labels = [...new Set(rows.map((row) => row.label))];
  if (services.length === 1) {
    return `تحب سعر ${services[0]} أنهي نوع؟\n${rows.map((row) => `- ${row.label}`).join("\n")}`;
  }
  if (labels.length === 1) {
    return `تحب سعر ${labels[0]} في أنهي خدمة؟\n${rows.map((row) => `- ${row.service}`).join("\n")}`;
  }
  return `${PRICE_TYPE_CHOICE_PROMPT}\n${priceChoiceLines(rows)}`;
}

/** Same type labels the scheduling resources page shows. */
const PROVIDER_ROLE_TITLES: Record<string, string> = {
  doctor: "دكتور",
  instructor: "أستاذ",
  therapist: "معالج",
  engineer: "مهندس",
};

function providerPriceReply(
  providerName: string,
  role: string | null,
  rows: CatalogPriceRow[],
): string {
  const title = role ? PROVIDER_ROLE_TITLES[role] : undefined;
  const subject =
    role === "doctor"
      ? `سعر كشف دكتور ${providerName}`
      : title
        ? `سعر ${title} ${providerName}`
        : `سعر ${providerName}`;
  if (rows.length === 1) {
    const row = rows[0]!;
    return `${subject} (${row.service} - ${row.label}): ${formatCatalogAmount(row.amount, row.currency)}`;
  }
  const lines = rows.map(
    (row) => `- ${row.service} (${row.label}): ${formatCatalogAmount(row.amount, row.currency)}`,
  );
  return `${subject}:\n${lines.join("\n")}`;
}

function priceInquiryReply(messages: RuntimeGatewayChatRequest["messages"]): string {
  const rows = listSchedulingPrices(messages);
  if (rows.length === 0) return "مفيش أسعار مسجّلة دلوقتي.";
  const latest = latestUserTextFromMessages(messages);
  const provider = providerNamedInText(latest, listCatalogProviderLinks(messages));
  let pool = rows;
  if (provider) {
    const serviceNames = new Set(
      listCatalogProviderLinks(messages)
        .filter((link) => link.id === provider.id)
        .map((link) => normalizeSchedulingCatalogLabel(link.serviceName)),
    );
    pool = rows.filter((row) => serviceNames.has(normalizeSchedulingCatalogLabel(row.service)));
    if (pool.length === 0) return `مفيش سعر مسجّل لـ${provider.name} دلوقتي.`;
  }
  const matched = rowsMatchingPriceText(latest, pool);
  const chosen = matched.length > 0 ? matched : pool;
  if (provider) {
    const providerKey = normalizeSchedulingCatalogLabel(provider.name);
    const role =
      listSchedulingProviders(messages).find(
        (entry) => normalizeSchedulingCatalogLabel(entry.name) === providerKey,
      )?.role ?? null;
    return providerPriceReply(provider.name, role, chosen);
  }
  if (matched.length > 0) return priceChoiceReply(matched);
  if (rows.length === 1) return singlePriceReply(rows[0]!);
  return `${PRICE_TYPE_CHOICE_PROMPT}\n${priceChoiceLines(rows)}`;
}

function serviceCatalogReply(messages: RuntimeGatewayChatRequest["messages"]): string {
  const names = listSchedulingServiceNames(messages);
  if (names.length === 0) {
    return "قوليلي الخدمة اللي تحب تعرف عنها، وأقولك التفاصيل.";
  }
  return `الخدمات المتاحة عندنا:\n${names.map((name) => `- ${name}`).join("\n")}\nلو حابب تحجز، قولي اسم الخدمة.`;
}

const PROVIDER_ROLE_LABELS: Record<string, string> = {
  doctor: "الأطباء",
  employee: "الموظفون",
  therapist: "المعالجون",
  instructor: "الأساتذة",
  engineer: "المهندسون",
  room: "الغرف",
  chair: "المقاعد",
  equipment: "الأجهزة",
  other: "مقدمو الخدمات",
};

const STAFF_PROVIDER_ROLES = new Set(["doctor", "employee", "therapist", "instructor", "engineer", "other"]);

function providerRoleLabel(role: string | null): string {
  if (!role) return "مقدمو الخدمات";
  return PROVIDER_ROLE_LABELS[role] ?? "مقدمو الخدمات";
}

function listSchedulingProviders(
  messages: RuntimeGatewayChatRequest["messages"],
): Array<{ name: string; role: string | null; services: string[] }> {
  const catalogBlob = messages.map((message) => String(message.content ?? "")).join("\n");
  const providers = new Map<string, { name: string; role: string | null; services: string[] }>();

  const resourcePattern =
    /-\s*([^:\n]+?)\s*:\s*resourceId=[0-9a-f-]{36}(?:\s+role=([a-z_]+))?/gi;
  let match: RegExpExecArray | null = resourcePattern.exec(catalogBlob);
  while (match) {
    const name = match[1]?.trim();
    if (!name) {
      match = resourcePattern.exec(catalogBlob);
      continue;
    }
    const key = normalizeSchedulingCatalogLabel(name);
    const role = match[2]?.trim() || null;
    const existing = providers.get(key);
    if (existing) {
      if (!existing.role && role) existing.role = role;
    } else {
      providers.set(key, { name, role, services: [] });
    }
    match = resourcePattern.exec(catalogBlob);
  }

  const offerPattern = /-\s*([^\n]+?)\s+offers\s+([^(:\n]+?)(?:\s*\(|:|\s*serviceId=)/gi;
  match = offerPattern.exec(catalogBlob);
  while (match) {
    const name = match[1]?.trim();
    const serviceName = match[2]?.trim();
    if (name) {
      const key = normalizeSchedulingCatalogLabel(name);
      const existing = providers.get(key) ?? { name, role: null, services: [] };
      if (serviceName && !existing.services.includes(serviceName)) existing.services.push(serviceName);
      providers.set(key, existing);
    }
    match = offerPattern.exec(catalogBlob);
  }

  const rows = [...providers.values()];
  const staff = rows.filter((row) => !row.role || STAFF_PROVIDER_ROLES.has(row.role));
  return staff.length > 0 ? staff : rows;
}

function providerRosterReply(messages: RuntimeGatewayChatRequest["messages"]): string {
  const providers = listSchedulingProviders(messages);
  if (providers.length === 0) {
    return "مفيش مقدمي خدمة متسجلين دلوقتي. قوليلي الخدمة اللي تحب تعرف عنها.";
  }
  const groups = new Map<string, string[]>();
  for (const provider of providers) {
    const label = providerRoleLabel(provider.role);
    const line =
      provider.services.length > 0 ? `- ${provider.name}: ${provider.services.join("، ")}` : `- ${provider.name}`;
    const bucket = groups.get(label) ?? [];
    bucket.push(line);
    groups.set(label, bucket);
  }
  const sections = [...groups.entries()].map(([label, lines]) => `${label}:\n${lines.join("\n")}`);
  return `${sections.join("\n")}\nلو حابب تحجز، قولي اسم الخدمة واسم الشخص.`;
}

const CASUAL_CHAT_BLOCKED_TOOLS = new Set([
  "search_availability",
  "find_next_available",
  "recommend_appointment",
  "create_booking",
  "create_customer",
  "search_customer",
]);

function gatewayToolsForCustomerTurn(
  tools: unknown[],
  messages: RuntimeGatewayChatRequest["messages"],
): unknown[] {
  const latest = latestUserTextFromMessages(messages);
  const unguidedYes = looksLikeBookingAffirmation(latest) && assistantAskedGenericBooking(messages);
  const freshBooking = looksLikeFreshBookingRequest(latest);
  const hideScheduling =
    looksLikeCasualReply(latest) ||
    looksLikeSchedulingInfoQuestion(latest, messages) ||
    unguidedYes ||
    freshBooking;
  const allowFindNext = customerWantsFindNextAvailable(messages);
  return tools.filter((tool) => {
    const name =
      tool &&
      typeof tool === "object" &&
      "function" in tool &&
      tool.function &&
      typeof tool.function === "object" &&
      "name" in tool.function
        ? String(tool.function.name ?? "")
        : "";
    if (name === "find_next_available" && !allowFindNext) return false;
    if (hideScheduling && CASUAL_CHAT_BLOCKED_TOOLS.has(name)) return false;
    return true;
  });
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
  if (looksLikeSchedulingInfoQuestion(latestUserTextFromMessages(messages), messages)) return true;
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
  // "الساعة 11" has no minutes. If that hour has exactly one offered time, use it.
  if (
    selectionParts &&
    selectionParts.minute === 0 &&
    exactMatches.length === 0 &&
    ambiguousMatches.length === 0
  ) {
    const hourMatches = offered.filter((slot) => {
      const parts = slotStartHour12Parts(slot.slotStart);
      return Boolean(parts && parts.hour12 === selectionParts.hour12);
    });
    if (hourMatches.length === 1) return hourMatches[0]!;
  }
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

  // One offered slot (nearest appointment) is selected when the customer confirms it
  // without repeating the clock: "احجز لي", "أكد آخر ميعاد", or the same weekday/date.
  if (offered.length === 1) {
    const only = offered[0]!;
    let confirmMatch: CanonicalSchedulingSlot | null = null;
    for (let index = attemptStart; index < messages.length; index += 1) {
      if (offerBoundary >= 0 && index <= offerBoundary) continue;
      const message = messages[index];
      if (message?.role !== "user") continue;
      const content = typeof message.content === "string" ? message.content : "";
      if (!content.trim() || isQuestionMarkNudge(content)) continue;
      // A clock in the same message is an explicit time, not a bare "book that slot".
      if (parseArabicClockToSlotStart(convertArabicDigitsToAscii(content))) continue;
      const affirms = userAffirmsSingleOfferedSlot(content);
      const sameDay = weekdayDateOnlyMatchesSingleOffer(content, only);
      if ((affirms || sameDay) && !singleOfferConflictsWithUserText(content, only)) {
        confirmMatch = only;
      } else if (singleOfferConflictsWithUserText(content, only)) {
        confirmMatch = null;
      }
    }
    if (confirmMatch) return confirmMatch;
  }

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
  if (looksLikeCasualReply(latestUserTextFromMessages(messages))) return false;
  if (looksLikeSchedulingInfoQuestion(latestUserTextFromMessages(messages), messages)) return false;
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
  catalogMessages?: RuntimeGatewayChatRequest["messages"],
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
  } else {
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
  }

  const serviceId = String(next.serviceId ?? "").trim();
  if (isUuid(serviceId) && !String(next.visitType ?? "").trim()) {
    const kind = chosenVisitKind(catalogMessages ?? sourceMessages, serviceId);
    if (kind) next.visitType = kind;
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
  const corpus = sourceMessages
    .filter((message) => message.role === "user")
    .map((message) => String(message.content ?? ""))
    .join("\n");
  const phone = extractSingleEgyptianMobileE164(corpus);
  if (phone) {
    const current = typeof next.phone === "string" ? next.phone.trim() : "";
    const validated = current ? validateEgyptMobilePhone(current) : null;
    const same = Boolean(validated?.valid && `+${validated.normalized}` === phone);
    if (!current || !validated?.valid || same) {
      next.phone = phone;
      next.region = "EG";
    }
  }
  const contact = extractPurchaseContact(corpus);
  if (contact.email && !String(next.email ?? "").trim()) next.email = contact.email;
  if (contact.name) {
    const name = String(next.name ?? "").trim();
    if (!name || name.split(/\s+/).length < 2) next.name = contact.name;
  }
  return next;
}

function rewriteQualifyLeadArgs(
  args: Record<string, unknown> | undefined,
  toolExecutions: ToolCallLoopResult["toolExecutions"],
  trustedCustomerId: string | null,
): Record<string, unknown> {
  const next = { ...(args ?? {}) };
  const candidate = typeof next.leadId === "string" ? next.leadId.trim() : "";
  const created = [...toolExecutions].reverse().find(
    (execution) =>
      execution.toolKey === "create_customer" &&
      execution.status === "succeeded" &&
      typeof execution.output?.leadId === "string" &&
      execution.output.leadId.trim().length > 0,
  );
  const leadId = typeof created?.output?.leadId === "string" ? created.output.leadId.trim() : "";
  const customerId = typeof created?.output?.customerId === "string" ? created.output.customerId.trim() : "";
  if (leadId && (!candidate || candidate === customerId || candidate === trustedCustomerId)) {
    next.leadId = leadId;
  }
  return next;
}

function userTextsFromMessages(messages: RuntimeGatewayChatRequest["messages"]): string[] {
  return messages
    .filter((message) => message.role === "user")
    .map((message) => String(message.content ?? "").trim())
    .filter(Boolean)
    .slice(-20);
}

function salesFallbackLanguage(messages: RuntimeGatewayChatRequest["messages"]): SalesFallbackLanguage {
  const detected = detectCustomerLanguage(userTextsFromMessages(messages).join("\n"));
  if (detected === "ar" || detected === "de" || detected === "en") return detected;
  return "en";
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

const COMPLAINT_DESCRIPTION_REQUIRED = "COMPLAINT_DESCRIPTION_REQUIRED";
const ASK_COMPLAINT_DESCRIPTION_REPLY =
  "برجاء إدخال نص الشكوى بالتفصيل عشان أسجّلها وأحدد أولويتها (عالية / متوسطة / بسيطة).";

/** Arabic status word: حالة (correct) or حاله (common dialect spelling). */
const TICKET_STATUS_WORD = /حال[ةه]/u;

/** Track/status/list intents — must never open a new ticket. */
function latestIsTicketStatusOrListIntent(latest: string): boolean {
  const text = latest.trim();
  if (!text) return false;
  if (isAddTicketCommentIntentText(text) || isChangeTicketFieldIntentText(text)) return false;
  if (/(?:عايز|وريني|اعرض|show).{0,24}(?:التذاكر|تذاكر(?:ي|ك|نا)?|شكاو(?:ي|ى)?)|my tickets|show me my tickets/i.test(text)) {
    return true;
  }
  return (
    /تتبع|اتتبع|ابحث\s*(?:عن\s*)?(?:حال[ةه]\s*)?(?:ال)?(?:شكو|تذكر)|رقم\s*(?:ال)?(?:تذكر|شكو)|فين\s*(?:ال)?شكو|ايش\s*صار.*(?:شكو|تذكر)|ticket\s*(?:status|number)|track\s*(?:my\s*)?(?:ticket|complaint)|status\s*(?:of\s*)?(?:ticket|complaint)/i.test(
      text,
    ) ||
    TICKET_STATUS_WORD.test(text) && /(?:شكو|تذكر|complaint|ticket)/i.test(text) &&
      /(?:اعرف|أشوف|اشوف|عايز|محتاج|قول|وريني|تتبع|اتتبع|حاله|حالة)/i.test(text)
  );
}

/** Add a comment on an existing complaint — not create. */
function isAddTicketCommentIntentText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  // Dialect "ع" ≈ على; "كومنت" / "تحديث" are common WhatsApp wording for a ticket note.
  const commentWord = /(?:تعليق|كومنت|comment|تحديث|update)/iu;
  const onTicket =
    /(?:على|علي|(?:^|[\s،,])ع)\s*(?:ال)?(?:شكو[يىب]?|تذكر|TKT-)|(?:ال)?(?:شكو[يىب]?|تذكر|TKT-)/iu;
  return (
    /(?:ضيف|أضف|اضيف|أضيف|add)\s+(?:تعليق|كومنت|comment|تحديث)/iu.test(trimmed) ||
    /(?:ضيف|أضف|اضيف|أضيف)\s+(?:على|علي|(?:^|[\s،,])ع|في\s+)?(?:ال)?(?:شكو[يىب]?|تذكر)/iu.test(trimmed) ||
    /(?:عايز(?:ة|ه)?|محتاج(?:ة)?).{0,40}(?:اضيف|أضيف|أضف|ضيف).{0,40}(?:تعليق|كومنت|comment|تحديث)/iu.test(
      trimmed,
    ) ||
    /(?:عايز(?:ة|ه)?|محتاج(?:ة)?).{0,40}(?:تعليق|كومنت|comment|تحديث).{0,40}(?:شكو[يىب]?|تذكر|TKT-)/iu.test(
      trimmed,
    ) ||
    (commentWord.test(trimmed) && onTicket.test(trimmed) && !/(?:منتج|المنتجات|كتالوج|products?)/iu.test(trimmed))
  );
}

/** Bare "التحديث" / "كومنت" after we asked what they meant — still ticket-comment mode. */
function isTicketCommentModeClarification(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 40) return false;
  return /^(?:لا\s+)?(?:انا\s+)?(?:ال)?(?:تحديث|التعليق|تعليق|كومنت|comment|update)[!.؟?\s]*$/iu.test(
    trimmed,
  );
}

/** Vague model follow-up ("اي هو؟") must not drop the customer out of add-comment. */
function assistantAskedVagueTicketClarification(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  const text = lastAssistantText(messages);
  if (!text.trim()) return false;
  return /(?:اي|إيه|ايه)\s*(?:هو|هي|بالظبط|بالضبط)|قصدك\s*(?:ايه|إيه)|what\s+(?:is\s+it|do\s+you\s+mean)/iu.test(
    text,
  );
}

/** Change status or priority on an existing complaint — not booking, not create. */
function isChangeTicketFieldIntentText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (
    /(?:غيّ?ر|اغير|أغير|change).{0,40}(?:حال[ةه]|status|أ?ولوية|اولوية|priority).{0,40}(?:شكو|تذكر|ticket|complaint)?/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  if (
    /(?:خليها|خلّيها|اجعلها|خلها).{0,24}(?:مقفول|مغلق|مغلقه|مغلقة|عاجل|عاجله|عاجلة|مفتوح|محلوم|محلولة|resolved|closed|urgent)/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  return false;
}

function isBareComplaintIntentPhrase(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (/^(?:شكو[يى]|شكاو(?:ى|ي)?|تذكر[ةه]?|complaint|ticket)\s*[.؟!!?]*$/iu.test(trimmed)) return true;
  if (
    /^(?:عايز(?:ة|ه)?|محتاج(?:ة)?|أبغى|ابغى)?\s*(?:ان\s*)?(?:افتح|أفتح|اعمل|أعمل|نعمل|أقدم|اقدم|افتحي)?\s*(?:لي\s*)?(?:شكو[يى]|شكاو(?:ى|ي)?|تذكر[ةه]?|complaint|ticket)\s*[.؟!!?]*$/iu.test(
      trimmed,
    )
  ) {
    return true;
  }
  if (/^(?:create|open|file)\s+(?:a\s+)?(?:new\s+)?(?:complaint|ticket)\s*[.!?]*$/i.test(trimmed)) {
    return true;
  }
  return false;
}

/** Real complaint body — not just "عايز أفتح شكوى". */
function complaintDescriptionIsSufficient(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 10) return false;
  if (isBareComplaintIntentPhrase(trimmed)) return false;
  if (latestIsTicketStatusOrListIntent(trimmed)) return false;
  // Enough substance beyond a pure open-intent phrase.
  return trimmed.length >= 10;
}

function assistantAskedForComplaintDetails(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  const text = typeof lastAssistant?.content === "string" ? lastAssistant.content : "";
  if (!text.trim()) return false;
  // Only our hard complaint-intake gate — never generic "تفاصيل" / booking questions.
  return (
    text.includes(ASK_COMPLAINT_DESCRIPTION_REPLY) ||
    /برجاء\s*(?:إدخال|ادخل|اكتب)\s*نص\s*(?:ال)?شكو/iu.test(text)
  );
}

/** True only for an explicit "I want to open a complaint" phrase (not status/add/change). */
function isExplicitOpenComplaintIntent(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (latestIsTicketStatusOrListIntent(trimmed)) return false;
  if (isAddTicketCommentIntentText(trimmed)) return false;
  if (isChangeTicketFieldIntentText(trimmed)) return false;
  if (isBareComplaintIntentPhrase(trimmed)) return true;
  // Require an open/create verb — "عايز اعرف/اضيف" must NOT match.
  return (
    /(?:عايز(?:ة|ه)?|محتاج(?:ة)?|أبغى|ابغى)\s*(?:ان\s*)?(?:افتح|أفتح|اعمل|أعمل|نعمل|أقدم|اقدم|أرفع|ارفع|افتحي).{0,40}(?:شكو|تذكر|complaint|ticket)/i.test(
      trimmed,
    ) ||
    /(?:^|\s)(?:افتح|أفتح|اعمل|أعمل|نعمل|أقدم|اقدم|أرفع|ارفع|create|open|file).{0,40}(?:شكو|تذكر|complaint|ticket)/i.test(
      trimmed,
    )
  );
}

function recentUserWantsAddTicketComment(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  const users = messages
    .filter((message) => message.role === "user")
    .slice(-6)
    .map((message) => String(message.content ?? ""));
  return users.some((text) => isAddTicketCommentIntentText(text));
}

function recentUserWantsChangeTicketFields(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  const users = messages
    .filter((message) => message.role === "user")
    .slice(-6)
    .map((message) => String(message.content ?? ""));
  return users.some((text) => isChangeTicketFieldIntentText(text));
}

function assistantAskedForCommentTicketNumber(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  const text = lastAssistantText(messages);
  return (
    text.includes(ASK_TICKET_FOR_COMMENT_REPLY) ||
    text.includes(ASK_TICKET_COMMENT_GOT_BODY_ASK_NUMBER_REPLY) ||
    (/رقم\s*(?:ال)?(?:شكو|تذكر)/iu.test(text) &&
      /تعليق|تحديث|كومنت|ترد|تود|تضيف|أضف/iu.test(text)) ||
    /هل\s*(?:لديك|عندك)\s*رقم\s*(?:ال)?(?:شكو|تذكر)/iu.test(text)
  );
}

function customerWantsAddTicketComment(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  const latest = latestUserTextFromMessages(messages);
  if (isAddTicketCommentIntentText(latest)) return true;
  // Sticky only while we are mid comment/update intake — not forever after any "تحديث" mention.
  if (!recentUserWantsAddTicketComment(messages)) return false;
  if (isChangeTicketFieldIntentText(latest)) return false;
  if (latestIsTicketStatusOrListIntent(latest) && !assistantAskedForCommentTicketNumber(messages)) {
    return false;
  }
  if (isExplicitOpenComplaintIntent(latest) && !assistantAskedForTicketComment(messages)) return false;
  // "التحديث" alone after "اي هو؟" is still choosing comment/update — never products/chat.
  if (isTicketCommentModeClarification(latest)) return true;
  if (assistantAskedVagueTicketClarification(messages) && latest.trim().length >= 1 && latest.trim().length <= 80) {
    return true;
  }
  // After we asked for the update text (or last-ticket was chosen), keep the next body turn here.
  if (assistantAskedForTicketComment(messages) && isUsableTicketCommentBodyText(latest)) {
    return true;
  }
  return (
    assistantAskedForTicketComment(messages) ||
    assistantAskedForCommentTicketNumber(messages) ||
    wantsLastOpenedTicket(latest) ||
    Boolean(readTicketNumberFromLatestUserMessage(messages))
  );
}

function customerWantsChangeTicketFields(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  const latest = latestUserTextFromMessages(messages);
  if (isChangeTicketFieldIntentText(latest)) return true;
  if (wantsLastOpenedTicket(latest) && recentUserWantsChangeTicketFields(messages)) return true;
  // Sticky through number/status confirmation turns.
  if (
    assistantAskedTicketNumberConfirmForChange(messages) ||
    assistantAskedStatusChangeConfirm(messages) ||
    assistantAskedForTicketStatusTarget(messages) ||
    assistantAskedClarifyTicketNumber(messages)
  ) {
    if (isAddTicketCommentIntentText(latest) || isExplicitOpenComplaintIntent(latest)) return false;
    return true;
  }
  if (!recentUserWantsChangeTicketFields(messages)) return false;
  if (isAddTicketCommentIntentText(latest) || latestIsTicketStatusOrListIntent(latest)) return false;
  if (isExplicitOpenComplaintIntent(latest)) return false;
  return (
    Boolean(readTicketNumberFromMessages(messages)) ||
    Boolean(parseTicketStatusTargetFromText(latest)) ||
    Boolean(parseTicketPriorityTargetFromText(latest)) ||
    /تغيّري حالتها|هحدّث|عايزة الحالة تبقى|تحب تغيّر الحالة/iu.test(lastAssistantText(messages)) ||
    /رقم\s*(?:ال)?(?:شكو|تذكر)/iu.test(lastAssistantText(messages))
  );
}

function customerContinuingComplaintIntake(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  // Must be answering OUR complaint-text ask — otherwise every follow-up becomes a ticket.
  if (!assistantAskedForComplaintDetails(messages)) return false;
  const latest = latestUserTextFromMessages(messages);
  if (!complaintDescriptionIsSufficient(latest)) return false;
  if (isExplicitOpenComplaintIntent(latest) || latestIsTicketStatusOrListIntent(latest)) return false;
  return true;
}

function readComplaintDescriptionForCreate(
  messages: RuntimeGatewayChatRequest["messages"],
): string | null {
  const latest = latestUserTextFromMessages(messages).trim();
  if (complaintDescriptionIsSufficient(latest)) return latest;
  return null;
}

function deriveTicketPriorityFromText(text: string): "low" | "normal" | "high" | "urgent" {
  const t = text.toLowerCase();
  if (
    /(?:urgent|فوراً?|فوري|الحين|الآن|دلوقتي|طوارئ|emergency|خطر|انتحار|محامي|نيابة|بلاغ\s*رسمي|مستعجل\s*جد)/iu.test(
      t,
    )
  ) {
    return "urgent";
  }
  if (
    /(?:فلوس|مبلغ|دفع|payment|refund|احتيال|fraud|سرقة|خصوصية|بيانات|data\s*breach|مدير|مشرف|manager|escalate|عطل\s*كامل|ما\s*بيشتغل|مش\s*شغال|زعلان\s*جد)/iu.test(
      t,
    )
  ) {
    return "high";
  }
  if (/(?:اقتراح|للعلم|suggestion|feedback|بسيط|minor|تجميلي)/iu.test(t)) return "low";
  return "normal";
}

function subjectFromComplaintDescription(description: string): string {
  const compact = description.replace(/\s+/g, " ").trim();
  if (compact.length <= 60) return compact || "شكوى";
  return `${compact.slice(0, 57).trim()}…`;
}

function customerWantsCreateTicket(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  const latest = latestUserTextFromMessages(messages);
  if (!latest) return false;
  // Status / track / list / add-comment / change-status must never create.
  if (latestIsTicketStatusOrListIntent(latest)) return false;
  if (isAddTicketCommentIntentText(latest) || isChangeTicketFieldIntentText(latest)) return false;
  if (recentUserWantsAddTicketComment(messages) && assistantAskedForTicketComment(messages)) {
    return false;
  }
  if (recentUserWantsChangeTicketFields(messages) && assistantAskedForTicketStatusTarget(messages)) {
    return false;
  }
  // Only continue intake when we just asked for the complaint body.
  if (customerContinuingComplaintIntake(messages)) return true;
  // Explicit open intent only — never "any sentence that mentions شكوى".
  return isExplicitOpenComplaintIntent(latest);
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
    customerWantsAddTicketComment(messages) ||
    customerWantsChangeTicketFields(messages) ||
    /(?:حدّ?ث|update).{0,40}(?:TKT-|(?:عنوان|موضوع|وصف|تفاصيل)\s*(?:ال)?(?:تذك|شكو))/i.test(latest) ||
    /(?:عيّ?ن|assign).{0,30}(?:TKT-|تذك|موظف)/i.test(latest) ||
    /(?:أ?ولوية|اولوية|priority).{0,40}(?:TKT-|تذك|عالية|منخفضة|عاجلة|high|low|urgent)/i.test(latest)
  );
}

function customerWantsTicketList(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  const latest = latestUserTextFromMessages(messages);
  if (customerWantsOpenAndClosedTicketBrowse(latest)) return true;
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
  const latest = latestUserTextFromMessages(messages);
  if (isAddTicketCommentIntentText(latest) || isChangeTicketFieldIntentText(latest)) return false;
  return latestIsTicketStatusOrListIntent(latest);
}

function extractTicketNumberFromText(text: string): string | null {
  const withPrefix = text.match(/TKT-\d+/gi);
  if (withPrefix && withPrefix.length > 0) {
    return withPrefix[withPrefix.length - 1]!.toUpperCase();
  }
  const bare = text.match(/(?:^|\s)(\d{5,8})(?:\s|$)/);
  if (bare?.[1]) return `TKT-${bare[1]}`;
  return null;
}

function readTicketNumberFromLatestUserMessage(
  messages: RuntimeGatewayChatRequest["messages"],
): string | null {
  return extractTicketNumberFromText(latestUserTextFromMessages(messages));
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
    const fromText = extractTicketNumberFromText(userMessages[index] ?? "");
    if (fromText) return fromText;
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
const ASK_TICKET_FOR_COMMENT_REPLY =
  "تمام، ابعتي رقم الشكوى اللي عايزة تضيفي عليها تعليق أو تحديث (مثال: TKT-000085) أو قولي «آخر شكوى».";
const ASK_TICKET_COMMENT_GOT_BODY_ASK_NUMBER_REPLY =
  "تمام، استلمت التحديث. ابعت رقم الشكوى (مثال: TKT-000085) أو قولي «آخر شكوى» عشان أسجّله.";
const ASK_TICKET_FOR_STATUS_CHANGE_REPLY =
  "ممكن رقم الشكوى اللي تحب تغيّر حالتها؟ (مثال: TKT-000085) أو قولي «آخر شكوى».";
const ASK_TICKET_CLARIFY_NUMBER_REPLY =
  "وضّح الرقم الصح (مثال: TKT-000085) أو قولي «آخر شكوى».";
const ASK_TICKET_COMMENT_BODY_REPLY = "اكتبي التعليق اللي عايزة أضيفه على الشكوى.";
/** Customer-facing "حالة" here means priority/severity (عاجلة / بسيطة), not workflow status. */
const ASK_TICKET_NEW_PRIORITY_CHOICES = [
  "1) بسيطة",
  "2) متوسطة",
  "3) عالية",
  "4) عاجلة",
].join("\n");
const ASK_TICKET_NEW_STATUS_CHOICES = ASK_TICKET_NEW_PRIORITY_CHOICES;
const ASK_TICKET_NEW_STATUS_REPLY = [
  "تحب تغيّر حالة الشكوى لإيه؟ اختار رقم أو الاسم:",
  ASK_TICKET_NEW_PRIORITY_CHOICES,
].join("\n");
const TICKET_COMMENT_BODY_REQUIRED = "TICKET_COMMENT_BODY_REQUIRED";
const TICKET_STATUS_TARGET_REQUIRED = "TICKET_STATUS_TARGET_REQUIRED";
const TICKET_PICK_REQUIRED = "TICKET_PICK_REQUIRED";
const TICKET_NUMBER_CONFIRM_REQUIRED = "TICKET_NUMBER_CONFIRM_REQUIRED";
const TICKET_STATUS_CONFIRM_REQUIRED = "TICKET_STATUS_CONFIRM_REQUIRED";
/** Browse/list replies show at most the latest N complaints — only when the customer asked to see them. */
const TICKET_LIST_BROWSE_LIMIT = 3;

function askConfirmTicketNumberForStatusChange(ticketNumber: string): string {
  return `هل نغيّر حالة الشكوى رقم ${ticketNumber}؟ قولي نعم للتأكيد أو لأ لو الرقم غلط.`;
}

function askTicketNewStatusForTicket(ticketNumber: string): string {
  return [
    `تحب تغيّر حالة الشكوى رقم ${ticketNumber} لإيه؟ اختار رقم أو الاسم:`,
    ASK_TICKET_NEW_PRIORITY_CHOICES,
  ].join("\n");
}

function askConfirmStatusChange(ticketNumber: string, statusLabel: string): string {
  return `هغيّر حالة الشكوى رقم ${ticketNumber} إلى «${statusLabel}». تمام؟ (نعم / لأ)`;
}

function ticketStatusChangedSuccessMessage(ticketNumber: string, statusLabel: string): string {
  return [
    `تم تغيير حالة الشكوى رقم ${ticketNumber} إلى «${statusLabel}».`,
    "هنواصل معاك في أقرب وقت. شكراً لتفهمك.",
  ].join("\n");
}

function wantsLastOpenedTicket(text: string): boolean {
  return /(?:آخر|اخر)\s*(?:شكو|تذكر)|(?:ال)?شكو[يىة].{0,16}(?:الآخر|الاخير|الأخيرة|اللي\s*فاتح)|last\s*(?:open(?:ed)?\s*)?(?:ticket|complaint)/iu.test(
    text.trim(),
  );
}

function customerWantsOpenAndClosedTicketBrowse(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const closed = /(?:مقفول|مغلق|اتقفل|اتقفلت|closed|محلوم|محلولة|resolved)/iu.test(trimmed);
  const open = /(?:شغال|مفتوح|قيد\s*العمل|قيد\s*المعالجة|لسه|open|in_progress)/iu.test(trimmed);
  return closed && open && /(?:اعرض|وريني|عايز|شكاو|تذاكر|حالات|شكو)/iu.test(trimmed);
}

function assistantAskedTicketNumberConfirmForChange(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  return /هل\s*نغيّ?ر\s*حال[ةه]\s*(?:ال)?شكو|قولي\s*نعم\s*للتأكيد/iu.test(lastAssistantText(messages));
}

function assistantAskedStatusChangeConfirm(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  const text = lastAssistantText(messages);
  return (
    /هغيّ?ر\s*حال[ةه]\s*(?:ال)?شكو/iu.test(text) &&
    /تمام[?؟]\s*\(نعم\s*\/\s*لأ\)/iu.test(text)
  );
}

function assistantAskedClarifyTicketNumber(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  const text = lastAssistantText(messages);
  // Status-change number clarify only — never treat comment/update asks as change-status sticky.
  return text.includes(ASK_TICKET_CLARIFY_NUMBER_REPLY) || text.includes(ASK_TICKET_FOR_STATUS_CHANGE_REPLY);
}

function readPendingTicketNumberFromAssistant(
  messages: RuntimeGatewayChatRequest["messages"],
): string | null {
  const match = lastAssistantText(messages).match(/TKT-\d+/i);
  return match?.[0]?.toUpperCase() ?? null;
}

function parsePriorityChoiceFromText(
  text: string,
): { kind: "priority"; value: "low" | "normal" | "high" | "urgent" } | null {
  const trimmed = text.trim();
  if (/^(?:1|١)$/u.test(trimmed) || /^(?:بسيط|بسيطة|منخفض|منخفضة)$/iu.test(trimmed)) {
    return { kind: "priority", value: "low" };
  }
  if (/^(?:2|٢)$/u.test(trimmed) || /^(?:متوسط|متوسطة|عادي|عادية|normal|medium)$/iu.test(trimmed)) {
    return { kind: "priority", value: "normal" };
  }
  if (/^(?:3|٣)$/u.test(trimmed) || /^(?:عالي|عالية|مرتفع|مرتفعة|high)$/iu.test(trimmed)) {
    return { kind: "priority", value: "high" };
  }
  if (/^(?:4|٤)$/u.test(trimmed) || /^(?:عاجل|عاجله|عاجلة|urgent)$/iu.test(trimmed)) {
    return { kind: "priority", value: "urgent" };
  }
  return parseTicketPriorityTargetFromText(trimmed);
}

function parseStatusChoiceFromText(
  text: string,
):
  | { kind: "priority"; value: "low" | "normal" | "high" | "urgent" }
  | { kind: "status"; value: "open" | "in_progress" | "waiting_customer" | "resolved" | "closed" }
  | null {
  const trimmed = text.trim();
  // Menu choices are priorities (عاجلة / بسيطة). Explicit close/open words still map to workflow status.
  const priority = parsePriorityChoiceFromText(trimmed);
  if (priority) return priority;
  return parseTicketStatusTargetFromText(trimmed);
}

function statusValueFromPriorityLabel(
  label: string,
): "low" | "normal" | "high" | "urgent" | null {
  const t = label.trim();
  if (/^بسيط/u.test(t) || /^منخفض/u.test(t)) return "low";
  if (/^متوسط/u.test(t) || /^عادي/u.test(t)) return "normal";
  if (/^عالي/u.test(t) || /^مرتفع/u.test(t)) return "high";
  if (/^عاجل/u.test(t)) return "urgent";
  return null;
}

function readPendingFieldChangeFromAssistant(
  messages: RuntimeGatewayChatRequest["messages"],
):
  | {
      kind: "priority";
      ticketNumber: string;
      value: "low" | "normal" | "high" | "urgent";
    }
  | {
      kind: "status";
      ticketNumber: string;
      value: "open" | "in_progress" | "waiting_customer" | "resolved" | "closed";
    }
  | null {
  const text = lastAssistantText(messages);
  const ticketMatch = text.match(/TKT-\d+/i);
  const labelMatch = text.match(/إلى\s*«([^»]+)»/);
  if (!ticketMatch || !labelMatch?.[1]) return null;
  const ticketNumber = ticketMatch[0]!.toUpperCase();
  const label = labelMatch[1].trim();
  const priority = statusValueFromPriorityLabel(label);
  if (priority) return { kind: "priority", ticketNumber, value: priority };
  const status = statusValueFromLabel(label);
  if (status) return { kind: "status", ticketNumber, value: status };
  return null;
}

function ticketStatusLabel(statusRaw: string): string {
  if (statusRaw === "in_progress") return "قيد المعالجة";
  if (statusRaw === "waiting_customer") return "بانتظار ردك";
  if (statusRaw === "resolved") return "تم الحل";
  if (statusRaw === "closed") return "مغلقة";
  return "مفتوحة";
}

function ticketPriorityLabel(priorityRaw: string): string {
  if (priorityRaw === "urgent") return "عاجلة";
  if (priorityRaw === "high") return "عالية";
  if (priorityRaw === "low") return "بسيطة";
  return "متوسطة";
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
    const rows = tickets
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
        return { number, statusRaw };
      })
      .filter((row): row is { number: string; statusRaw: string } => Boolean(row));
    if (rows.length > 0) {
      const displayRows = rows.slice(0, TICKET_LIST_BROWSE_LIMIT);
      const intro =
        displayRows.length >= TICKET_LIST_BROWSE_LIMIT ? "آخر 3 شكاوى:" : "شكاويك:";
      return [
        intro,
        ...displayRows.map((row) => `- ${row.number}: ${ticketStatusLabel(row.statusRaw)}`),
      ].join("\n");
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

function applyAskTicketNumberFallback(
  response: RuntimeGatewayChatResponse,
  messages: RuntimeGatewayChatRequest["messages"],
  toolExecutions: ToolCallLoopResult["toolExecutions"],
): RuntimeGatewayChatResponse {
  if (hasSuccessfulSearchTicket(toolExecutions)) {
    const lastSearch = readSuccessfulSearchTicket(toolExecutions);
    if (lastSearch?.output?.needsTicketNumber !== true) return response;
  }
  const wantsStatus = customerWantsTicketStatus(messages);
  const wantsAdd = customerWantsAddTicketComment(messages);
  const wantsChange = customerWantsChangeTicketFields(messages);
  if (
    !wantsStatus &&
    !wantsAdd &&
    !wantsChange &&
    !isFalseTicketSearchDenial(response.text ?? "")
  ) {
    return response;
  }
  if (readTicketNumberFromMessages(messages)) return response;

  const ask = wantsAdd
    ? ASK_TICKET_FOR_COMMENT_REPLY
    : wantsChange
      ? ASK_TICKET_FOR_STATUS_CHANGE_REPLY
      : ASK_TICKET_NUMBER_REPLY;
  const text = response.text.trim();
  if (
    text.includes(ask) ||
    (/رقم\s*(?:ال)?(?:شكو|تذكر)/i.test(text) && /ابعث|ابعت|قول|اكتبي|اكتبيلي/i.test(text))
  ) {
    return response;
  }

  return {
    ...response,
    text: ask,
    finishReason: response.finishReason ?? "stop",
  };
}

function readListedTicketSummaries(
  toolExecutions: ToolCallLoopResult["toolExecutions"],
  options?: { includeClosed?: boolean },
): Array<{ ticketNumber: string; status: string }> {
  const lastSearch = readSuccessfulSearchTicket(toolExecutions);
  if (!lastSearch?.output) return [];
  const includeClosed = options?.includeClosed === true;
  const tickets = Array.isArray(lastSearch.output.tickets) ? lastSearch.output.tickets : [];
  const rows: Array<{ ticketNumber: string; status: string }> = [];
  for (const ticket of tickets) {
    if (!ticket || typeof ticket !== "object") continue;
    const number =
      typeof (ticket as { ticketNumber?: unknown }).ticketNumber === "string"
        ? String((ticket as { ticketNumber: string }).ticketNumber).trim().toUpperCase()
        : "";
    if (!number) continue;
    const statusRaw =
      typeof (ticket as { status?: unknown }).status === "string"
        ? String((ticket as { status: string }).status)
        : "open";
    if (!includeClosed && (statusRaw === "closed" || statusRaw === "resolved")) continue;
    rows.push({ ticketNumber: number, status: statusRaw });
  }
  return rows;
}

function formatTicketPickList(
  tickets: Array<{ ticketNumber: string; status: string }>,
  purpose: "comment" | "change",
): string {
  const capped = tickets.slice(0, TICKET_LIST_BROWSE_LIMIT);
  const lines = capped.map(
    (ticket) => `- ${ticket.ticketNumber}: ${ticketStatusLabel(ticket.status)}`,
  );
  const intro =
    purpose === "comment"
      ? "آخر شكاوى عندك — ابعتي رقم اللي عايزة تضيفي عليها تعليق أو تحديث:"
      : "آخر شكاوى عندك — ابعتي رقم اللي عايزة تغيّري حالتها:";
  return [intro, ...lines].join("\n");
}

function assistantAskedForTicketComment(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  const text = lastAssistantText(messages);
  return (
    text.includes(ASK_TICKET_COMMENT_BODY_REPLY) ||
    /اكتبي\s*(?:ال)?(?:تعليق|تحديث)/iu.test(text) ||
    /هضيف\s*(?:ال)?تعليق/iu.test(text) ||
    /(?:ما\s*هو|ما\s*هي|ايش|إيه|ايه)\s*(?:ال)?(?:تحديث|تعليق|كومنت)/iu.test(text) ||
    /(?:التحديث|التعليق|الكومنت).{0,48}(?:تود|عايز|تحب|تضيف|أضف|اضافه|إضافته)/iu.test(text) ||
    /what\s+(?:update|comment)\s+(?:would|do|should)/iu.test(text)
  );
}

function assistantAskedForTicketStatusTarget(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  const text = lastAssistantText(messages);
  return (
    text.includes(ASK_TICKET_NEW_STATUS_CHOICES) ||
    text.includes(ASK_TICKET_NEW_STATUS_REPLY) ||
    /تحب\s*تغيّ?ر\s*(?:حال[ةه]\s*)?(?:ال)?شكو|تحب\s*تغيّ?ر\s*الحال/iu.test(text) ||
    /عايزة\s*(?:ال)?حال[ةه]\s*تبقى/iu.test(text) ||
    /اختاري\s*(?:ال)?حال[ةه]|قولي\s*(?:ال)?حال[ةه]\s*(?:ال)?جديدة/iu.test(text)
  );
}

function readLatestOpenTicketNumber(
  toolExecutions: ToolCallLoopResult["toolExecutions"],
): string | null {
  const lastSearch = readSuccessfulSearchTicket(toolExecutions);
  if (!lastSearch?.output) return null;
  const fromField =
    typeof lastSearch.output.latestOpenTicketNumber === "string"
      ? lastSearch.output.latestOpenTicketNumber.trim().toUpperCase()
      : "";
  if (fromField) return fromField;
  const listed = readListedTicketSummaries(toolExecutions);
  return listed[0]?.ticketNumber ?? null;
}

function statusValueFromLabel(
  label: string,
): "open" | "in_progress" | "waiting_customer" | "resolved" | "closed" | null {
  const t = label.trim();
  if (/^مفتوح/u.test(t)) return "open";
  if (/قيد\s*المعالجة/u.test(t)) return "in_progress";
  if (/بانتظار/u.test(t)) return "waiting_customer";
  if (/محلول|تم\s*الحل/u.test(t)) return "resolved";
  if (/مغلق|مقفول/u.test(t)) return "closed";
  return null;
}

function isUsableTicketCommentBodyText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 2) return false;
  if (isAddTicketCommentIntentText(trimmed) && trimmed.length < 24) return false;
  if (isChangeTicketFieldIntentText(trimmed)) return false;
  if (latestIsTicketStatusOrListIntent(trimmed)) return false;
  if (wantsLastOpenedTicket(trimmed)) return false;
  if (/^TKT-\d+$/i.test(trimmed) || /^\d{5,8}$/.test(trimmed)) return false;
  if (isAffirmativeReply(trimmed) || isNegativeReply(trimmed)) return false;
  return true;
}

function readTicketCommentBodyFromMessages(
  messages: RuntimeGatewayChatRequest["messages"],
): string | null {
  const latest = latestUserTextFromMessages(messages).trim();
  if (!latest) return null;
  if (isAddTicketCommentIntentText(latest)) {
    const inline = /(?:تعليق|تحديث|كومنت|comment|update)\s*[:：]?\s*(.+)$/i.exec(latest);
    if (inline?.[1] && inline[1].trim().length >= 2) return inline[1].trim();
    return null;
  }
  // Accept the update text when we asked for the ticket number or the comment body.
  if (
    (assistantAskedForTicketComment(messages) || assistantAskedForCommentTicketNumber(messages)) &&
    isUsableTicketCommentBodyText(latest)
  ) {
    return latest;
  }
  // After the customer sends the ticket number, reuse an earlier update text from this flow.
  if (
    recentUserWantsAddTicketComment(messages) &&
    (Boolean(readTicketNumberFromLatestUserMessage(messages)) || wantsLastOpenedTicket(latest))
  ) {
    const users = messages
      .filter((message) => message.role === "user")
      .slice(-8)
      .map((message) => String(message.content ?? "").trim());
    for (let index = users.length - 1; index >= 0; index -= 1) {
      const text = users[index] ?? "";
      if (text === latest) continue;
      if (!isUsableTicketCommentBodyText(text)) continue;
      if (isAddTicketCommentIntentText(text)) continue;
      return text;
    }
  }
  return null;
}

function parseTicketStatusTargetFromText(
  text: string,
): { kind: "status"; value: "open" | "in_progress" | "waiting_customer" | "resolved" | "closed" } | null {
  const t = text.trim();
  if (!t) return null;
  if (/(?:مقفول|مقفوله|مقفولة|مغلق|مغلقه|مغلقة|closed)/iu.test(t)) return { kind: "status", value: "closed" };
  if (/(?:محلول|محلومه|محلولة|تم\s*الحل|resolved)/iu.test(t)) return { kind: "status", value: "resolved" };
  if (/(?:قيد\s*المعالجة|in_progress|تحت\s*المعالجة)/iu.test(t)) {
    return { kind: "status", value: "in_progress" };
  }
  if (/(?:بانتظار|waiting_customer|بانتظار(?:ك|العميل))/iu.test(t)) {
    return { kind: "status", value: "waiting_customer" };
  }
  if (/(?:مفتوح|مفتوحه|مفتوحة|\bopen\b)/iu.test(t) && !/(?:اولوية|أولوية|priority)/iu.test(t)) {
    return { kind: "status", value: "open" };
  }
  return null;
}

function parseTicketPriorityTargetFromText(
  text: string,
): { kind: "priority"; value: "low" | "normal" | "high" | "urgent" } | null {
  const t = text.trim();
  if (!t) return null;
  if (/(?:عاجل|عاجله|عاجلة|urgent)/iu.test(t)) return { kind: "priority", value: "urgent" };
  if (/(?:عالي|عالية|مرتفع|مرتفعة|high)/iu.test(t)) return { kind: "priority", value: "high" };
  if (/(?:منخفض|منخفضة|low)/iu.test(t)) return { kind: "priority", value: "low" };
  if (/(?:عادي|عادية|متوسط|متوسطة|normal|medium)/iu.test(t)) {
    return { kind: "priority", value: "normal" };
  }
  return null;
}

function readTicketFieldTargetFromMessages(
  messages: RuntimeGatewayChatRequest["messages"],
):
  | { kind: "status"; value: "open" | "in_progress" | "waiting_customer" | "resolved" | "closed" }
  | { kind: "priority"; value: "low" | "normal" | "high" | "urgent" }
  | null {
  const latest = latestUserTextFromMessages(messages).trim();
  if (!latest) return null;
  if (assistantAskedForTicketStatusTarget(messages)) {
    return parseStatusChoiceFromText(latest) ?? parseTicketPriorityTargetFromText(latest);
  }
  const status = parseTicketStatusTargetFromText(latest);
  if (status) return status;
  const priority = parseTicketPriorityTargetFromText(latest);
  if (priority) return priority;
  return null;
}

function hasSuccessfulAddTicketComment(
  toolExecutions: ToolCallLoopResult["toolExecutions"],
): boolean {
  return toolExecutions.some(
    (execution) =>
      execution.toolKey === "add_ticket_comment" &&
      execution.status === "succeeded" &&
      execution.output?.success === true,
  );
}

function hasSuccessfulChangeTicketField(
  toolExecutions: ToolCallLoopResult["toolExecutions"],
): boolean {
  return toolExecutions.some(
    (execution) =>
      (execution.toolKey === "change_ticket_status" ||
        execution.toolKey === "change_ticket_priority" ||
        execution.toolKey === "close_ticket") &&
      execution.status === "succeeded" &&
      execution.output?.success === true,
  );
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
  const wantsChange = customerWantsChangeTicketFields(input.sourceMessages);
  const wantsAdd = customerWantsAddTicketComment(input.sourceMessages);
  const wantsAddOrChange = wantsAdd || wantsChange;
  // Never auto-dump tickets for comment/update/status-change — only when the customer asked to see them.
  const wantsTicketList =
    customerWantsTicketList(input.sourceMessages) && !ticketNumber && !wantsChange && !wantsAdd;
  const ticketSearches = input.toolExecutions.filter((execution) => execution.toolKey === "search_ticket");

  if (
    wantsChange &&
    (assistantAskedTicketNumberConfirmForChange(input.sourceMessages) ||
      assistantAskedStatusChangeConfirm(input.sourceMessages) ||
      assistantAskedForTicketStatusTarget(input.sourceMessages) ||
      assistantAskedClarifyTicketNumber(input.sourceMessages)) &&
    !wantsLastOpenedTicket(latestUserText) &&
    !latestIsTicketNumber
  ) {
    // Guided status-change turns own the reply — do not search/list tickets mid-flow.
    return;
  }

  // Explicit "وريني تذاكري" while in comment/update — show at most last 3, then ask continues separately.
  if (
    wantsAdd &&
    !ticketNumber &&
    customerWantsTicketList(input.sourceMessages) &&
    ticketSearches.length === 0
  ) {
    const routed = await input.tools.route(input.ctx, {
      conversationId: input.conversationId,
      toolKey: "search_ticket",
      input: { limit: TICKET_LIST_BROWSE_LIMIT },
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

  if (
    (wantsChange || wantsAdd) &&
    !ticketNumber &&
    wantsLastOpenedTicket(latestUserText) &&
    ticketSearches.length === 0
  ) {
    const routed = await input.tools.route(input.ctx, {
      conversationId: input.conversationId,
      toolKey: "search_ticket",
      input: { limit: 5 },
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

  // Body turn after "آخر شكوى": toolExecutions reset each turn — re-fetch latest open ticket.
  if (
    wantsAdd &&
    !ticketNumber &&
    !readPendingTicketNumberFromAssistant(input.sourceMessages) &&
    assistantAskedForTicketComment(input.sourceMessages) &&
    isUsableTicketCommentBodyText(latestUserText) &&
    ticketSearches.length === 0
  ) {
    const routed = await input.tools.route(input.ctx, {
      conversationId: input.conversationId,
      toolKey: "search_ticket",
      input: { limit: 5 },
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
      input: { limit: TICKET_LIST_BROWSE_LIMIT },
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
    !wantsAddOrChange &&
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
  let cleaned = raw;
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
  return /(?:أقرب\s*موعد|أقرب\s*ميعاد|أول\s*موعد|ايه أقرب|إيه أقرب|earliest(?:\s+available)?|next\s+(?:available|open(?:\s+time)?)|find[_ ]?next(?:_available)?|nächst(?:e|er|en|em|es)?\s+(?:freie[rnms]?\s+)?termin\b)/i.test(
    trimmed,
  );
}

function customerWantsFindNextAvailable(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  return customerWantsFindNextAvailableFromText(latestUserTextFromMessages(messages));
}

/** Nearest-slot request made earlier in the same booking attempt, while the latest turn only continues it (slot pick, name, phone). */
function findNextIntentEarlierInBooking(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  const texts = userTextsSinceBookingStart(messages);
  const latest = (texts.at(-1) ?? "").trim();
  if (!latest) return false;
  if (/(?:الغي|ألغي|الغى|الغاء|إلغاء|cancel)/i.test(latest)) return false;
  if (customerWantsRescheduleFromText(latest) || customerWantsOtherSlots(latest)) return false;
  if (looksLikeFreshBookingRequest(latest)) return false;
  return texts.slice(0, -1).some((text) => customerWantsFindNextAvailableFromText(text));
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

function formatFindNextFacing(
  output: Record<string, unknown> | null,
  language: CustomerReplyLanguage = "ar",
): string | null {
  if (!output) return null;
  const slot = output.slot;
  let fromSlot: string | null = null;
  if (slot && typeof slot === "object") {
    const date = typeof (slot as { date?: unknown }).date === "string" ? (slot as { date: string }).date : "";
    const start =
      typeof (slot as { start?: unknown }).start === "string" ? (slot as { start: string }).start : "";
    const resourceName =
      typeof (slot as { resourceName?: unknown }).resourceName === "string"
        ? (slot as { resourceName: string }).resourceName
        : "";
    if (date && start) {
      fromSlot =
        language === "en"
          ? `Next open time: ${date} at ${start}${resourceName ? ` with ${resourceName}` : ""}.`
          : language === "de"
            ? `Nächster freier Termin: ${date} um ${start}${resourceName ? ` bei ${resourceName}` : ""}.`
            : `أقرب موعد متاح: يوم ${date} الساعة ${start}${resourceName ? ` مع ${resourceName}` : ""}.`;
    }
  }
  const facing =
    typeof output.customerFacingMessage === "string" ? output.customerFacingMessage.trim() : "";
  if (language === "ar") {
    if (facing) return facing;
    if (fromSlot) return fromSlot;
    if (typeof output.message === "string" && output.message.trim()) return output.message.trim();
    return null;
  }
  if (fromSlot) return fromSlot;
  if (facing && !/[\u0600-\u06FF]/.test(facing)) return facing;
  return null;
}

/** User explicitly wants another nearest slot (do not suppress duplicate-facing guard). */
function customerWantsAnotherFindNext(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  const latest = latestUserTextFromMessages(messages).trim();
  if (!latest) return false;
  return (
    /(?:أقرب|اقرب|earliest|next\s+available).{0,24}(?:تاني|ثاني|غيره|أخرى|اخرى|آخر|اخر|again|another)/i.test(latest) ||
    customerWantsOtherSlots(latest)
  );
}

/** Other times besides the slot already offered. Must reply with a list, not another nearest-slot replay. */
function customerWantsOtherSlots(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/(?:الغي|ألغي|الغى|الغاء|إلغاء|cancel)/i.test(trimmed)) return false;
  // A singular "أقرب موعد …" is one nearest slot; plural "المواعيد … غير أقرب ميعاد" stays a list.
  if (customerWantsFindNextAvailableFromText(trimmed) && !/مواعيد/u.test(trimmed)) return false;
  if (/(?:احجز|أحجز|هحجز|book)/i.test(trimmed) && !/(?:تاني|ثاني|غير|أخر|اخر)/i.test(trimmed)) {
    return false;
  }
  // "أقرب موعد متاح" / "أقرب موعد تاني" belong to find_next_available; only "غير أقرب" asks for the day list.
  if (customerWantsFindNextAvailableFromText(trimmed) && !/غير\s*(?:ال)?[اأ]قرب/u.test(trimmed)) {
    return false;
  }
  return /(?:مواعيد|ميعاد|معاد|موعد).{0,32}(?:متاح|تان|ثاني|غير|أخر|اخر|آخر)|(?:ايه|إيه|ما\s*هي|ماهي)\s+المواعيد|(?:غير).{0,16}(?:المعاد|الموعد|الميعاد)|other\s+(?:slots|times|appointments)|another\s+(?:slot|time|appointment)/iu.test(
    trimmed,
  );
}

const AVAILABILITY_DAY_PROMPT = "اختار اليوم";

function listCatalogServices(
  messages: RuntimeGatewayChatRequest["messages"],
): Array<{ name: string; id: string }> {
  const catalogBlob = messages.map((message) => String(message.content ?? "")).join("\n");
  const services: Array<{ name: string; id: string }> = [];
  const pattern = /-\s*([^:\n]+?)\s*:\s*serviceId=([0-9a-f-]{36})/gi;
  let match: RegExpExecArray | null = pattern.exec(catalogBlob);
  while (match) {
    const name = match[1]?.trim();
    const id = match[2]?.trim();
    if (name && id) services.push({ name, id });
    match = pattern.exec(catalogBlob);
  }
  return services;
}

function resolveDiscussedService(
  messages: RuntimeGatewayChatRequest["messages"],
  toolExecutions: ToolCallLoopResult["toolExecutions"] = [],
): { name: string; id: string } | null {
  const services = listCatalogServices(messages);
  const userTexts = messages
    .filter((message) => message.role === "user")
    .map((message) => String(message.content ?? ""));
  for (const text of [...userTexts].reverse()) {
    const normalized = normalizeSchedulingCatalogLabel(text);
    const hits = services.filter((service) => {
      const name = normalizeSchedulingCatalogLabel(service.name);
      return name.length >= 2 && normalized.includes(name);
    });
    if (hits.length === 0) continue;
    hits.sort((left, right) => right.name.length - left.name.length);
    return hits[0] ?? null;
  }
  for (const execution of [...toolExecutions].reverse()) {
    if (execution.status !== "succeeded" || !execution.output) continue;
    const output = execution.output;
    const direct = typeof output.serviceId === "string" ? output.serviceId : "";
    const slot = output.slot;
    const fromSlot =
      slot && typeof slot === "object" && typeof (slot as { serviceId?: unknown }).serviceId === "string"
        ? (slot as { serviceId: string }).serviceId
        : "";
    const serviceId = direct || fromSlot;
    const named = services.find((service) => service.id === serviceId);
    if (named) return named;
  }
  return null;
}

type ListedAvailabilitySlot = { date: string; start: string; resourceName: string };

function collectAvailabilitySlots(output: Record<string, unknown> | null): ListedAvailabilitySlot[] {
  const resources = output && Array.isArray(output.resources) ? output.resources : [];
  const slots: ListedAvailabilitySlot[] = [];
  for (const resource of resources) {
    if (!resource || typeof resource !== "object") continue;
    const resourceName =
      typeof (resource as { resourceName?: unknown }).resourceName === "string"
        ? (resource as { resourceName: string }).resourceName
        : "";
    const resourceSlots = Array.isArray((resource as { slots?: unknown }).slots)
      ? ((resource as { slots: unknown[] }).slots)
      : [];
    for (const slot of resourceSlots) {
      if (!slot || typeof slot !== "object") continue;
      const date = typeof (slot as { date?: unknown }).date === "string" ? (slot as { date: string }).date : "";
      const start = typeof (slot as { start?: unknown }).start === "string" ? (slot as { start: string }).start.trim() : "";
      if (!date || !start) continue;
      if ((slot as { available?: unknown }).available === false) continue;
      slots.push({ date, start, resourceName });
    }
  }
  return slots;
}

const AVAILABILITY_WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function formatAvailabilityDay(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  const weekday = AVAILABILITY_WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? "";
  return `${weekday} ${day}/${month}/${year}`.trim();
}

function matchChosenAvailabilityDate(text: string, dates: string[]): string | null {
  const folded = foldArabicRelativeDateText(text);
  for (const date of dates) {
    if (folded.includes(date)) return date;
    const [year, month, day] = date.split("-");
    if (!year || !month || !day) continue;
    const dayNumber = String(Number(day));
    const monthNumber = String(Number(month));
    if (
      folded.includes(`${dayNumber}/${monthNumber}`) ||
      folded.includes(`${day}-${month}`) ||
      folded.includes(`${dayNumber}-${monthNumber}`)
    ) {
      return date;
    }
  }
  const weekdayMatch =
    /(السبت|الأحد|الاحد|الاثنين|الثلاثاء|الأربعاء|الاربعاء|الخميس|الجمعة)/i.exec(text);
  if (!weekdayMatch?.[1]) return null;
  const weekday = arabicWeekdayTokenToJs(weekdayMatch[1]);
  if (weekday === null) return null;
  return (
    dates.find((date) => {
      const [year, month, day] = date.split("-").map(Number);
      if (!year || !month || !day) return false;
      return new Date(Date.UTC(year, month - 1, day)).getUTCDay() === weekday;
    }) ?? null
  );
}

function assistantAskedForAvailabilityDay(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  const content = typeof lastAssistant?.content === "string" ? lastAssistant.content : "";
  return (
    content.includes(AVAILABILITY_DAY_PROMPT) ||
    content.includes("Choose a day.") ||
    content.includes("Wählen Sie einen Tag.")
  );
}

function formatAvailabilityDayMenu(
  serviceName: string,
  slots: ListedAvailabilitySlot[],
  language: CustomerReplyLanguage = "ar",
): string {
  const dates = [...new Set(slots.filter((slot) => slot.start.trim()).map((slot) => slot.date))].sort();
  if (dates.length === 0) {
    if (language === "en") return `There are no open times for ${serviceName} right now.`;
    if (language === "de") return `Für ${serviceName} sind derzeit keine freien Termine vorhanden.`;
    return `مفيش مواعيد متاحة لـ${serviceName} دلوقتي.`;
  }
  if (language !== "ar") {
    const lines = dates.map((date) => {
      const times = [
        ...new Set(slots.filter((slot) => slot.date === date).map((slot) => slot.start)),
      ];
      return `- ${date}: ${times.join(", ")}`;
    });
    const header =
      language === "de" ? `Freie Termine für ${serviceName}:` : `Open times for ${serviceName}:`;
    const prompt = language === "de" ? "Wählen Sie einen Tag." : "Choose a day.";
    return `${header}\n${lines.join("\n")}\n${prompt}`;
  }
  return `أيام المواعيد المتاحة لـ${serviceName}:\n${dates
    .map((date) => {
      const times = [
        ...new Set(
          slots.filter((slot) => slot.date === date).map((slot) => formatArabicTime12h(slot.start)),
        ),
      ];
      return `- ${formatAvailabilityDay(date)}: ${times.join("، ")}`;
    })
    .join("\n")}\n${AVAILABILITY_DAY_PROMPT}.`;
}

const BOOKING_SERVICE_PROMPTS = {
  ar: "تحب تحجز أنهي خدمة؟",
  en: "Which service would you like to book?",
  de: "Welche Leistung möchten Sie buchen?",
} as const;
const BOOKING_VISIT_PROMPTS = {
  ar: "تحب نوع الزيارة إيه؟",
  en: "Which visit type do you want?",
  de: "Welche Art des Besuchs möchten Sie?",
} as const;
const BOOKING_BRANCH_PROMPTS = {
  ar: "تحب تحجز في أنهي فرع؟",
  en: "Which branch would you like to book at?",
  de: "In welcher Filiale möchten Sie buchen?",
} as const;
const BOOKING_SERVICE_PROMPT = BOOKING_SERVICE_PROMPTS.ar;
const VISIT_TYPE_REQUIRED = "VISIT_TYPE_REQUIRED";
const BRANCH_REQUIRED = "BRANCH_REQUIRED";
const BOOKING_VISIT_PROMPT = BOOKING_VISIT_PROMPTS.ar;

function bookingServicePrompt(language: CustomerReplyLanguage): string {
  return BOOKING_SERVICE_PROMPTS[language];
}

function bookingVisitPrompt(language: CustomerReplyLanguage): string {
  return BOOKING_VISIT_PROMPTS[language];
}

function bookingBranchPrompt(language: CustomerReplyLanguage): string {
  return BOOKING_BRANCH_PROMPTS[language];
}

function textAsksForBranch(text: string): boolean {
  return Object.values(BOOKING_BRANCH_PROMPTS).some((prompt) => text.includes(prompt));
}

function listCatalogBranches(
  messages: RuntimeGatewayChatRequest["messages"],
): Array<{ name: string; id: string }> {
  const catalogBlob = messages.map((message) => String(message.content ?? "")).join("\n");
  const branches: Array<{ name: string; id: string }> = [];
  const pattern = /-\s*([^:\n]+?)\s*:\s*branchId=([0-9a-f-]{36})/gi;
  let match: RegExpExecArray | null = pattern.exec(catalogBlob);
  while (match) {
    const name = match[1]?.trim();
    const id = match[2]?.trim();
    if (name && id && !name.toLowerCase().includes("resourceid")) branches.push({ name, id });
    match = pattern.exec(catalogBlob);
  }
  // Deduplicate by id (resource lines may also carry branchId).
  const seen = new Set<string>();
  return branches.filter((branch) => {
    if (seen.has(branch.id)) return false;
    seen.add(branch.id);
    return true;
  });
}

function resourceBranchIdsByResourceId(
  messages: RuntimeGatewayChatRequest["messages"],
): Map<string, string> {
  const catalogBlob = messages.map((message) => String(message.content ?? "")).join("\n");
  const map = new Map<string, string>();
  const pattern =
    /-\s*[^:\n]+?:\s*resourceId=([0-9a-f-]{36})\s+role=\S+(?:\s+branchId=([0-9a-f-]{36}))?/gi;
  let match: RegExpExecArray | null = pattern.exec(catalogBlob);
  while (match) {
    const resourceId = match[1]?.trim();
    const branchId = match[2]?.trim();
    if (resourceId && branchId) map.set(resourceId, branchId);
    match = pattern.exec(catalogBlob);
  }
  return map;
}

/** Active branches that actually offer this service via a linked resource. */
function branchesForService(
  messages: RuntimeGatewayChatRequest["messages"],
  serviceId: string,
): Array<{ name: string; id: string }> {
  const id = serviceId.trim();
  if (!id) return [];
  const allBranches = listCatalogBranches(messages);
  const byId = new Map(allBranches.map((branch) => [branch.id, branch]));
  const resourceBranches = resourceBranchIdsByResourceId(messages);
  const links = listCatalogProviderLinks(messages);
  const ids = new Set<string>();
  for (const link of links) {
    if (link.serviceId !== id) continue;
    const branchId = resourceBranches.get(link.id);
    if (branchId) ids.add(branchId);
  }
  // If no resource→branch links, fall back to company branch list only when >0.
  if (ids.size === 0) return [];
  return [...ids].map((branchId) => byId.get(branchId) ?? { id: branchId, name: branchId });
}

function branchMenu(
  branches: Array<{ name: string; id: string }>,
  language: CustomerReplyLanguage = "ar",
): string {
  const lines = branches.map((branch) => `- ${branch.name}`).join("\n");
  return `${bookingBranchPrompt(language)}\n${lines}`;
}

function chosenBranchId(
  messages: RuntimeGatewayChatRequest["messages"],
  serviceId: string,
): string | null {
  const branches = branchesForService(messages, serviceId);
  if (branches.length === 0) return null;
  if (branches.length === 1) return branches[0]!.id;
  const texts = userTextsSinceBookingStart(messages);
  for (const text of [...texts].reverse()) {
    const [named] = namesMentionedInText(
      text,
      branches.map((branch) => branch.name),
    );
    const hit = branches.find((branch) => branch.name === named);
    if (hit) return hit.id;
  }
  return null;
}

/** Branch menu when the service is offered at more than one branch and none chosen yet. */
function missingBranchMenu(
  messages: RuntimeGatewayChatRequest["messages"],
  serviceId: unknown,
): string | null {
  const id = typeof serviceId === "string" ? serviceId.trim() : "";
  if (!isUuid(id)) return null;
  const branches = branchesForService(messages, id);
  if (branches.length <= 1) return null;
  if (chosenBranchId(messages, id)) return null;
  return branchMenu(branches, customerReplyLanguage(messages));
}


function textAsksForBookingService(text: string): boolean {
  return Object.values(BOOKING_SERVICE_PROMPTS).some((prompt) => text.includes(prompt));
}

function textAsksForVisitType(text: string): boolean {
  return Object.values(BOOKING_VISIT_PROMPTS).some((prompt) => text.includes(prompt));
}

function looksLikeBookingAffirmation(value: string): boolean {
  const trimmed = stripTrailingChatPunctuation(value);
  return /^(?:نعم|ايوه|أيوه|ايوة|yes)$/iu.test(trimmed);
}

function assistantAskedGenericBooking(
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  const content = typeof lastAssistant?.content === "string" ? lastAssistant.content : "";
  if (
    !content ||
    !(/حجز/u.test(content) || /\b(?:book(?:ing)?|appointment)\b/i.test(content) || /\b(?:buchen|termin)\b/i.test(content))
  ) {
    return false;
  }
  if (/\d{1,2}:\d{2}/.test(content)) return false;
  if (
    content.includes("أقرب موعد") ||
    content.includes("Next open time") ||
    content.includes("Nächster freier Termin") ||
    content.includes("المواعيد المتاحة") ||
    content.includes("Open times") ||
    content.includes("Freie Termine") ||
    content.includes(AVAILABILITY_DAY_PROMPT) ||
    content.includes("Choose a day.") ||
    content.includes("Wählen Sie einen Tag.") ||
    textAsksForBookingService(content) ||
    textAsksForVisitType(content)
  ) {
    return false;
  }
  return true;
}

function serviceNamedInText(
  text: string,
  services: Array<{ name: string; id: string }>,
): { name: string; id: string } | null {
  const normalized = normalizeSchedulingCatalogLabel(text);
  const hits = services.filter((service) => {
    const name = normalizeSchedulingCatalogLabel(service.name);
    return name.length >= 2 && normalized.includes(name);
  });
  hits.sort((left, right) => right.name.length - left.name.length);
  return hits[0] ?? null;
}

function pricedTypesForService(
  messages: RuntimeGatewayChatRequest["messages"],
  serviceName: string,
): CatalogPriceRow[] {
  const key = normalizeSchedulingCatalogLabel(serviceName);
  const rows: CatalogPriceRow[] = [];
  const seen = new Set<string>();
  for (const row of listSchedulingPrices(messages)) {
    if (normalizeSchedulingCatalogLabel(row.service) !== key) continue;
    const kind = row.kind.toLowerCase();
    if (seen.has(kind)) continue;
    seen.add(kind);
    rows.push(row);
  }
  return rows;
}

function serviceNameForCatalogId(
  messages: RuntimeGatewayChatRequest["messages"],
  serviceId: string,
): string | null {
  const catalogBlob = messages.map((message) => String(message.content ?? "")).join("\n");
  const match = new RegExp(`-\\s*([^:\\n]+?)\\s*:\\s*serviceId=${serviceId}`, "i").exec(catalogBlob);
  return match?.[1]?.trim() || null;
}

function chosenVisitKind(
  messages: RuntimeGatewayChatRequest["messages"],
  serviceId: string,
): string | undefined {
  const serviceName = serviceNameForCatalogId(messages, serviceId);
  if (!serviceName) return undefined;
  const types = pricedTypesForService(messages, serviceName);
  if (types.length === 1) return types[0]?.kind;
  const userTexts = userTextsSinceBookingStart(messages);
  for (let index = userTexts.length - 1; index >= 0; index -= 1) {
    const hits = rowsMatchingPriceText(userTexts[index] ?? "", types);
    const kinds = [...new Set(hits.map((row) => row.kind))];
    if (kinds.length === 1 && kinds[0]) return kinds[0];
  }
  return undefined;
}

function noBookableServices(language: CustomerReplyLanguage): string {
  if (language === "en") return "There are no services available to book right now.";
  if (language === "de") return "Derzeit sind keine Leistungen zur Buchung verfügbar.";
  return "مفيش خدمات متاحة للحجز دلوقتي.";
}

function serviceChoiceMenu(messages: RuntimeGatewayChatRequest["messages"]): string {
  const language = customerReplyLanguage(messages);
  const services = listCatalogServices(messages);
  if (services.length === 0) return noBookableServices(language);
  return `${bookingServicePrompt(language)}\n${services.map((service) => `- ${service.name}`).join("\n")}`;
}

function visitTypeMenu(
  serviceName: string,
  rows: CatalogPriceRow[],
  language: CustomerReplyLanguage = "ar",
): string {
  const lines = rows.map((row) => `- ${row.label}`).join("\n");
  if (language === "en") return `${bookingVisitPrompt(language)} for ${serviceName}\n${lines}`;
  if (language === "de") return `${bookingVisitPrompt(language)} für ${serviceName}\n${lines}`;
  return `${bookingVisitPrompt(language)} لـ${serviceName}\n${lines}`;
}

function lastChosenBookingService(
  messages: RuntimeGatewayChatRequest["messages"],
): { name: string; id: string } | null {
  const services = listCatalogServices(messages);
  const userTexts = messages
    .filter((message) => message.role === "user")
    .map((message) => String(message.content ?? ""));
  for (const text of [...userTexts].reverse()) {
    const named = serviceNamedInText(text, services);
    if (named) return named;
  }
  return null;
}

function bookingNameKey(value: string): string {
  const arabic: Record<string, string> = {
    ا: "a",
    أ: "a",
    إ: "a",
    آ: "a",
    ب: "b",
    ت: "t",
    ث: "t",
    ج: "j",
    ح: "h",
    خ: "kh",
    د: "d",
    ذ: "z",
    ر: "r",
    ز: "z",
    س: "s",
    ش: "sh",
    ص: "s",
    ض: "d",
    ط: "t",
    ظ: "z",
    ع: "a",
    غ: "g",
    ف: "f",
    ق: "k",
    ك: "k",
    ل: "l",
    م: "m",
    ن: "n",
    ه: "h",
    ة: "h",
    و: "w",
    ي: "y",
    ى: "a",
    ئ: "y",
    ؤ: "w",
  };
  let latin = "";
  for (const ch of value.trim().toLowerCase()) {
    if (arabic[ch]) latin += arabic[ch];
    else if (/[a-z0-9]/u.test(ch)) latin += ch;
  }
  return latin.replace(/[aeiou]/g, "").replace(/(.)\1+/g, "$1");
}

function looksLikeFreshBookingRequest(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || isSlotPickMessage(trimmed) || userAffirmsSingleOfferedSlot(trimmed)) return false;
  if (customerWantsOtherSlots(trimmed) || looksLikePriceQuestion(trimmed)) return false;
  if (customerWantsRescheduleFromText(trimmed) || /(?:الغي|ألغي|إلغاء|cancel)/iu.test(trimmed)) return false;
  if (/(?:i\s+want\s+to\s+book|i\s+would\s+like\s+to\s+book|book\s+an\s+appointment)/i.test(trimmed)) {
    return true;
  }
  if (/(?:ich\s+(?:moechte|will)|bitte)\s+(?:einen\s+)?termin\s+buchen/i.test(trimmed)) return true;
  if (/ich\s+möchte\s+(?:einen\s+)?termin\s+buchen/u.test(trimmed)) return true;
  if (/\btermin\s+buchen\b/i.test(trimmed)) return true;
  return /(?:عايز(?:ة|ه)?|محتاج(?:ة)?|أبغى|ابغى)\s*(?:ان\s*)?(?:احجز|أحجز|حجز)|(?:احجز|أحجز)\s*(?:مع|عند|موعد)|حجز\s*موعد|(?:اعمل|أعمل|نعمل)\s*(?:ال)?حجز/u.test(
    trimmed,
  );
}

/** User messages since the latest booking request, so a visit type picked for an earlier booking is not reused. */
function userTextsSinceBookingStart(messages: RuntimeGatewayChatRequest["messages"]): string[] {
  const userTexts = messages
    .filter((message) => message.role === "user")
    .map((message) => String(message.content ?? ""));
  for (let index = userTexts.length - 1; index >= 0; index -= 1) {
    if (looksLikeFreshBookingRequest(userTexts[index] ?? "")) return userTexts.slice(index);
  }
  return userTexts;
}

/** Visit-type menu when the service has several priced types and the customer has not picked one yet. */
function missingVisitTypeMenu(
  messages: RuntimeGatewayChatRequest["messages"],
  serviceId: unknown,
): string | null {
  const id = typeof serviceId === "string" ? serviceId.trim() : "";
  if (!isUuid(id)) return null;
  const serviceName = serviceNameForCatalogId(messages, id);
  if (!serviceName) return null;
  const types = pricedTypesForService(messages, serviceName);
  if (types.length <= 1) return null;
  if (chosenVisitKind(messages, id)) return null;
  return visitTypeMenu(serviceName, types, customerReplyLanguage(messages));
}

function bookingIntentIsRecent(messages: RuntimeGatewayChatRequest["messages"]): boolean {
  const userTexts = messages
    .filter((message) => message.role === "user")
    .map((message) => String(message.content ?? ""));
  if (userTexts.slice(-4, -1).some((text) => looksLikeFreshBookingRequest(text))) return true;
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  const assistantText = typeof lastAssistant?.content === "string" ? lastAssistant.content : "";
  const services = listCatalogServices(messages);
  const listed = services.filter((service) => assistantText.includes(service.name)).length;
  return (/خدم/u.test(assistantText) || /\bservice\b/i.test(assistantText) || /Leistung/i.test(assistantText)) && listed >= 2;
}

type CatalogProviderLink = { name: string; id: string; serviceName: string; serviceId: string };

function listCatalogProviderLinks(
  messages: RuntimeGatewayChatRequest["messages"],
): CatalogProviderLink[] {
  const catalogBlob = messages.map((message) => String(message.content ?? "")).join("\n");
  const links: CatalogProviderLink[] = [];
  const pattern =
    /-\s*([^\n]+?)\s+offers\s+([^(:\n]+?)\s*\(\s*serviceId=([0-9a-f-]{36})\s*,\s*resourceId=([0-9a-f-]{36})\s*\)/gi;
  let match: RegExpExecArray | null = pattern.exec(catalogBlob);
  while (match) {
    const name = match[1]?.trim();
    const serviceName = match[2]?.trim();
    const serviceId = match[3]?.trim();
    const id = match[4]?.trim();
    if (name && serviceName && serviceId && id) links.push({ name, id, serviceName, serviceId });
    match = pattern.exec(catalogBlob);
  }
  return links;
}

const NAME_MATCH_STOPWORDS = new Set([
  "موعد",
  "ميعاد",
  "معاد",
  "حجز",
  "احجز",
  "أحجز",
  "عايز",
  "عاوز",
  "عند",
  "اخر",
  "آخر",
  "الحجز",
  "الموعد",
  "الميعاد",
]);

/** Consonant skeleton without w/y, so "ADAM"/"ادم" and "Amir"/"امير" compare equal. */
function nameMatchKey(value: string): string {
  return bookingNameKey(value).replace(/[wy]/g, "");
}

/** Names from `names` that the customer mentioned, longest first; an ambiguous spelling-only match returns none. */
function namesMentionedInText(text: string, names: string[]): string[] {
  const stripped = text.replace(/دكتور(?:ة)?|طبيب(?:ة)?|\bdoctor\b|\bdr\.?\b/giu, " ");
  const normalized = normalizeSchedulingCatalogLabel(stripped);
  const unique = [...new Set(names.filter((name) => name.trim()))].sort((left, right) => right.length - left.length);
  const exact = unique.filter((name) => {
    const label = normalizeSchedulingCatalogLabel(name);
    return label.length >= 2 && normalized.includes(label);
  });
  if (exact.length > 0) return exact;
  const wordKeys = new Set(
    stripped
      .split(/\s+/u)
      .map((word) => word.replace(/[^\p{L}]/gu, ""))
      .filter((word) => word.length >= 3 && !NAME_MATCH_STOPWORDS.has(word))
      .map((word) => nameMatchKey(word))
      .filter((key) => key.length >= 2),
  );
  const bySpelling = unique.filter((name) =>
    [name, ...name.split(/\s+/u).filter((part) => part.length >= 3)].some((part) => {
      const key = nameMatchKey(part);
      return key.length >= 2 && wordKeys.has(key);
    }),
  );
  return bySpelling.length === 1 ? bySpelling : [];
}

function providerNamedInText(
  text: string,
  links: CatalogProviderLink[],
): { name: string; id: string; serviceIds: string[] } | null {
  const grouped = new Map<string, { name: string; id: string; serviceIds: string[] }>();
  for (const link of links) {
    const key = link.id;
    const existing = grouped.get(key) ?? { name: link.name, id: link.id, serviceIds: [] };
    if (!existing.serviceIds.includes(link.serviceId)) existing.serviceIds.push(link.serviceId);
    grouped.set(key, existing);
  }
  const providers = [...grouped.values()];
  const [named] = namesMentionedInText(
    text,
    providers.map((provider) => provider.name),
  );
  return providers.find((provider) => provider.name === named) ?? null;
}

function serviceChoiceMenuFor(
  services: Array<{ name: string; id: string }>,
  language: CustomerReplyLanguage = "ar",
): string {
  if (services.length === 0) return noBookableServices(language);
  return `${bookingServicePrompt(language)}\n${services.map((service) => `- ${service.name}`).join("\n")}`;
}

function readyBookingService(
  messages: RuntimeGatewayChatRequest["messages"],
  service: { name: string; id: string },
  text: string,
): { text: string } | { service: { name: string; id: string } } {
  const types = pricedTypesForService(messages, service.name);
  const pickedType = rowsMatchingPriceText(text, types);
  const uniqueKinds = [...new Set(pickedType.map((row) => row.kind.toLowerCase()))];
  if (types.length > 1 && uniqueKinds.length !== 1) {
    return { text: visitTypeMenu(service.name, types, customerReplyLanguage(messages)) };
  }
  const branches = branchesForService(messages, service.id);
  if (branches.length > 1 && !chosenBranchId(messages, service.id)) {
    return { text: branchMenu(branches, customerReplyLanguage(messages)) };
  }
  return { service };
}

function bookingSetupReply(
  messages: RuntimeGatewayChatRequest["messages"],
): { text: string } | { service: { name: string; id: string }; resourceId?: string } | null {
  const latest = latestUserTextFromMessages(messages);
  const services = listCatalogServices(messages);
  if (!latest || services.length === 0) return null;

  if (looksLikeBookingAffirmation(latest) && assistantAskedGenericBooking(messages)) {
    return { text: serviceChoiceMenu(messages) };
  }

  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  const assistantText = typeof lastAssistant?.content === "string" ? lastAssistant.content : "";

  if (textAsksForBookingService(assistantText)) {
    const providerLinks = listCatalogProviderLinks(messages);
    const picked = serviceNamedInText(latest, services);
    if (!picked) {
      // "مع دكتور حسن" answers the service menu by naming a provider instead of a service.
      const provider = providerNamedInText(latest, providerLinks);
      if (!provider) return { text: serviceChoiceMenu(messages) };
      const pool = services.filter((service) => provider.serviceIds.includes(service.id));
      if (pool.length !== 1) {
        return { text: serviceChoiceMenuFor(pool.length > 0 ? pool : services, customerReplyLanguage(messages)) };
      }
      const ready = readyBookingService(messages, pool[0]!, latest);
      if ("text" in ready) return ready;
      return { service: ready.service, resourceId: provider.id };
    }
    const types = pricedTypesForService(messages, picked.name);
    const pickedType = rowsMatchingPriceText(latest, types);
    const uniqueKinds = [...new Set(pickedType.map((row) => row.kind.toLowerCase()))];
    if (types.length > 1 && uniqueKinds.length !== 1) {
      return { text: visitTypeMenu(picked.name, types, customerReplyLanguage(messages)) };
    }
    const provider = providerNamedInText(
      messages
        .filter((message) => message.role === "user")
        .map((message) => String(message.content ?? ""))
        .join("\n"),
      providerLinks,
    );
    const providerOffersPick = provider?.serviceIds.includes(picked.id) === true;
    return { service: picked, ...(provider && providerOffersPick ? { resourceId: provider.id } : {}) };
  }

  if (textAsksForVisitType(assistantText)) {
    const providerLinks = listCatalogProviderLinks(messages);
    const picked = lastChosenBookingService(messages) ?? serviceNamedInText(assistantText, services);
    if (!picked) return { text: serviceChoiceMenu(messages) };
    const types = pricedTypesForService(messages, picked.name);
    const pickedType = rowsMatchingPriceText(latest, types);
    const uniqueKinds = [...new Set(pickedType.map((row) => row.kind.toLowerCase()))];
    const namedProvider = providerNamedInText(latest, providerLinks);
    // "عايز ادام" during the visit-type question is a provider switch, not a failed type pick.
    if (namedProvider && uniqueKinds.length !== 1) {
      const pool = services.filter((service) => namedProvider.serviceIds.includes(service.id));
      const choices = pool.length > 0 ? pool : services;
      const namedService = serviceNamedInText(latest, choices);
      const service = namedService ?? (choices.length === 1 ? choices[0]! : null);
      if (!service) return { text: serviceChoiceMenuFor(choices, customerReplyLanguage(messages)) };
      const ready = readyBookingService(messages, service, latest);
      if ("text" in ready) return ready;
      return { service: ready.service, resourceId: namedProvider.id };
    }
    if (uniqueKinds.length !== 1) {
      return { text: visitTypeMenu(picked.name, types, customerReplyLanguage(messages)) };
    }
    const provider = providerNamedInText(
      messages
        .filter((message) => message.role === "user")
        .map((message) => String(message.content ?? ""))
        .join("\n"),
      listCatalogProviderLinks(messages),
    );
    return { service: picked, ...(provider ? { resourceId: provider.id } : {}) };
  }

  const providerFollowUp =
    !looksLikeFreshBookingRequest(latest) &&
    !looksLikePriceQuestion(latest) &&
    latest.trim().split(/\s+/u).length <= 4 &&
    bookingIntentIsRecent(messages)
      ? providerNamedInText(latest, listCatalogProviderLinks(messages))
      : null;

  if (looksLikeFreshBookingRequest(latest) || providerFollowUp) {
    const provider = providerFollowUp ?? providerNamedInText(latest, listCatalogProviderLinks(messages));
    const pool = provider ? services.filter((service) => provider.serviceIds.includes(service.id)) : services;
    const choices = pool.length > 0 ? pool : services;
    const picked = serviceNamedInText(latest, choices);
    const service = picked ?? (choices.length === 1 ? choices[0]! : null);
    if (!service) return { text: serviceChoiceMenuFor(choices, customerReplyLanguage(messages)) };
    const ready = readyBookingService(messages, service, latest);
    if ("text" in ready) return ready;
    return { service: ready.service, ...(provider ? { resourceId: provider.id } : {}) };
  }

  return null;
}

function formatAvailabilityTimesForDay(
  serviceName: string,
  slots: ListedAvailabilitySlot[],
  date: string,
  language: CustomerReplyLanguage = "ar",
): string {
  const times = slots
    .filter((slot) => slot.date === date)
    .sort((left, right) => left.start.localeCompare(right.start));
  if (times.length === 0) {
    if (language === "en") return `There are no open times for ${serviceName} on that day.`;
    if (language === "de") return `Für ${serviceName} gibt es an diesem Tag keine freien Termine.`;
    return `مفيش مواعيد متاحة لـ${serviceName} في اليوم ده.`;
  }
  if (language !== "ar") {
    const withLabel = language === "de" ? "bei" : "with";
    const lines = times.map(
      (slot) => `- ${slot.start}${slot.resourceName ? ` ${withLabel} ${slot.resourceName}` : ""}`,
    );
    const header =
      language === "de"
        ? `Freie Termine am ${date} für ${serviceName}:`
        : `Open times on ${date} for ${serviceName}:`;
    return `${header}\n${lines.join("\n")}`;
  }
  const lines = times.map(
    (slot) => `- ${formatArabicTime12h(slot.start)}${slot.resourceName ? ` مع ${slot.resourceName}` : ""}`,
  );
  return `مواعيد ${formatAvailabilityDay(date)} لـ${serviceName}:\n${lines.join("\n")}`;
}

function applyFindNextAvailableReplyFallback(
  response: RuntimeGatewayChatResponse,
  toolExecutions: ToolCallLoopResult["toolExecutions"],
  messages: RuntimeGatewayChatRequest["messages"] = [],
): RuntimeGatewayChatResponse {
  if (looksLikeCasualReply(latestUserTextFromMessages(messages))) return response;
  if (looksLikeSchedulingInfoQuestion(latestUserTextFromMessages(messages), messages)) return response;
  const last = [...toolExecutions]
    .reverse()
    .find((execution) => execution.toolKey === "find_next_available");
  if (!last) return response;
  const facing = formatFindNextFacing(last.output ?? null, customerReplyLanguage(messages));
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
    const askedForNext = customerWantsFindNextAvailable(messages);
    const fromThisTurn = !String(last.executionId ?? "").startsWith("prior-scheduling");
    // Only an explicit nearest-slot request may replace the reply with this line.
    if (!askedForNext) return response;
    if (!fromThisTurn) return response;
    if (alreadyShown && !wantsAnother && response.text.trim() && response.text.includes(facing)) {
      return response;
    }
    if (alreadyShown && !wantsAnother && !askedForNext) return response;
    return { ...response, text: facing, finishReason: response.finishReason ?? "stop" };
  }
  if (!customerWantsFindNextAvailable(messages)) return response;
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
  if (looksLikeCasualReply(latestUserTextFromMessages(input.sourceMessages))) return;
  if (looksLikeSchedulingInfoQuestion(latestUserTextFromMessages(input.sourceMessages), input.sourceMessages)) return;
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
        customerFacingMessage: askNearestService(customerReplyLanguage(input.sourceMessages)),
      },
      durationMs: 0,
    });
    return;
  }

  const visitMenu = missingVisitTypeMenu(input.sourceMessages, serviceId);
  if (visitMenu) {
    input.toolExecutions.push({
      toolKey: "find_next_available",
      executionId: `forced-find-next-visit-type-${Date.now()}`,
      status: "failed",
      output: { success: false, errors: [VISIT_TYPE_REQUIRED], customerFacingMessage: visitMenu },
      durationMs: 0,
    });
    return;
  }

  const branchMenuText = missingBranchMenu(input.sourceMessages, serviceId);
  if (branchMenuText) {
    input.toolExecutions.push({
      toolKey: "find_next_available",
      executionId: `forced-find-next-branch-${Date.now()}`,
      status: "failed",
      output: { success: false, errors: [BRANCH_REQUIRED], customerFacingMessage: branchMenuText },
      durationMs: 0,
    });
    return;
  }

  const catalog = readSchedulingCatalogIds(input.sourceMessages, input.toolExecutions);
  const resolvedBranchId = chosenBranchId(input.sourceMessages, serviceId);
  try {
    const routed = await input.tools.route(input.ctx, {
      conversationId: input.conversationId,
      toolKey: "find_next_available",
      input: {
        serviceId,
        ...(catalog?.resourceId ? { resourceId: catalog.resourceId } : {}),
        ...(resolvedBranchId ? { branchId: resolvedBranchId } : {}),
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
        customerFacingMessage: nearestLookupFailed(customerReplyLanguage(input.sourceMessages)),
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
  if (/(?:الغي|ألغي|الغى|الغاء|إلغاء|cancel|stornier|absag)/i.test(trimmed)) return false;
  if (/^\+?\d[\d\s-]{7,}$/.test(trimmed.replace(/\s/g, ""))) return false;
  if (isSlotPickMessage(trimmed) || looksLikeBookingIntent(trimmed)) return true;
  if (/اسم(?:\s*المريض)?\s*[:：]/i.test(trimmed) && extractPhoneFromText(trimmed)) return true;
  return /(?:أقرب موعد|موعد متاح|المواعيد المتاحة|availability|find[_ ]?next|recommend|اقترح|أنسب ميعاد|عايز أحجز|عايزة أحجز|عايز حجز|عايزة حجز|محتاج احجز|محتاجة احجز|احجز|حجز(?:\s+جديد)?|^حجز$|search_availability|check[_\s-]?in|check[_\s-]?out|تسجيل حضور|تسجيل انصراف|أسجل حضور|أسجل انصراف|حجوزاتي|اعرف حجوز|what bookings)/i.test(
    trimmed,
  );
}

function customerWantsRescheduleFromText(text: string): boolean {
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
  return /(?:أغير|اغير|تغيير|تغير|عدّل|عدل|تأجيل|تاجيل|إعادة\s*جدولة|اعادة\s*جدولة|reschedule|change\s+(?:the\s+)?(?:appointment|booking|time|slot)|verschieb|umbuch|غير(?:ي)?\s+(?:ميعاد|موعد|ال)?(?:حجز)|أغير\s+ميعاد|عايز(?:ة)?\s+(?:أغير|اغير|أأجل|ااجل|أعدل|اعدل)|غيّر(?:ي)?\s+(?:الميعاد|الموعد|الحجز)|(?:أغير|اغير|تغيير)\s*(?:ال)?حجز)/i.test(
    trimmed,
  );
}

/** Create-booking continue copy must never answer a reschedule turn. */
const CREATE_BOOKING_CONTINUE_LEAK =
  /اسم المريض|نكمّل الحجز|نكمل الحجز|بنكمل الحجز|نفس الاسم والموعد|create_booking|حجز جديد/i;

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
    /(?:الغي|ألغي|الغى|الغاء|إلغاء|الالغاء|cancel(?:\s+(?:the\s+)?(?:booking|appointment))?|stornier|absag|عايز(?:ة)?\s*(?:الغي|ألغي|الغى))/i.test(
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
      /أنهي موعد|ممكن إلغاؤه|موعد تلغي|ده الموعد الوحيد|قولّي\s*"?ألغي|قولي\s*"?ألغي|اختار(?:ي)?\s*(?:موعد|رقم)|which appointment|which booking should i cancel|kann storniert werden|welche buchung soll ich stornieren|select.*(?:cancel|booking)/i.test(
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

function formatCancelChoices(rows: unknown, language: CustomerReplyLanguage): string {
  const bookings = Array.isArray(rows) ? rows : [];
  const lines = bookings.flatMap((row, index) => {
    if (!row || typeof row !== "object") return [];
    const reference = String((row as { reference?: unknown }).reference ?? "").trim();
    if (!reference) return [];
    return [`${index + 1}) ${reference.toUpperCase()}`];
  });
  if (lines.length === 0) {
    if (language === "en") return "I couldn't find a booking to cancel.";
    if (language === "de") return "Ich konnte keine Buchung zum Stornieren finden.";
    return "مفيش حجز نقدر نلغيه.";
  }
  if (language === "en") {
    return [
      lines.length === 1
        ? "I found 1 booking that can be cancelled:"
        : `I found ${lines.length} bookings that can be cancelled:`,
      ...lines,
      lines.length === 1
        ? 'This is the only one. Reply "cancel" or send the booking number.'
        : "Which booking should I cancel? Reply with the list number or the booking number. I will not cancel until you choose.",
    ].join("\n");
  }
  if (language === "de") {
    return [
      lines.length === 1
        ? "Ich habe 1 Buchung gefunden, die storniert werden kann:"
        : `Ich habe ${lines.length} Buchungen gefunden, die storniert werden können:`,
      ...lines,
      lines.length === 1
        ? 'Das ist die einzige. Antworte mit „stornieren“ oder sende die Buchungsnummer.'
        : "Welche Buchung soll ich stornieren? Antworte mit der Listennummer oder der Buchungsnummer. Ich storniere erst, nachdem du gewählt hast.",
    ].join("\n");
  }
  return ["لقيت مواعيد ممكن إلغاؤها:", ...lines, "قولّي أنهي موعد تلغي؟"].join("\n");
}

function readSearchBookingsReply(
  output: Record<string, unknown> | null,
  language: CustomerReplyLanguage = "ar",
): string | null {
  if (!output || output.success !== true) return null;
  const customerFacingMessage = output.customerFacingMessage;
  const facing =
    typeof customerFacingMessage === "string" ? customerFacingMessage.trim() : "";
  const cancelList =
    output.purpose === "cancel" || /ممكن إلغاؤه|أنهي موعد تلغي/.test(facing);
  if (language !== "ar" && cancelList) {
    return formatCancelChoices(output.bookings, language);
  }
  if (!facing) return null;
  if (language !== "ar" && /[\u0600-\u06FF]/.test(facing)) return null;
  return facing;
}

function isBareCancelConfirmationText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (customerWantsRescheduleFromText(trimmed)) return false;
  if (/\bBK-\d+\b/i.test(trimmed)) return false;
  if (/^\s*[1-8]\s*$/.test(trimmed)) return false;
  // Bare cancel verbs only. Affirmatives (نعم/ايوه) require an offered cancel list —
  // see assistantOfferedCancelList in customerWantsCancelBooking.
  // Allow "عايزة ألغي الحجز" / "عايز الغي" as bare cancel openers (no BK reference).
  const bare = trimmed.replace(/[.!?؟]+$/u, "");
  return (
    /^(?:عايز(?:ة|ه)?\s+)?(?:الغي|ألغي|الغى|الغاء|إلغاء)(?:\s+(?:الميعاد|الموعد|الحجز|ميعاد|موعد))?$/i.test(bare) ||
    /^(?:please\s+|i\s+want\s+to\s+|i(?:'d| would)\s+like\s+to\s+)?cancel(?:\s+(?:my|the)\s+(?:booking|appointment))?$/i.test(
      bare,
    ) ||
    /^(?:bitte\s+)?(?:stornieren|absagen)$/i.test(bare) ||
    /^(?:ich\s+möchte\s+)?(?:meine\s+buchung|meinen\s+termin)\s+(?:stornieren|absagen)$/iu.test(bare)
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
      /أنهي موعد|ممكن إلغاؤه|موعد تلغي|ده الموعد الوحيد|قولّي\s*"?ألغي|قولي\s*"?ألغي|مش هألغي غير بعد ما تختاري|which appointment|which booking should i cancel|kann storniert werden|welche buchung soll ich stornieren|select.*(?:cancel|booking)/i.test(
        text,
      ),
    );
}

/**
 * The model's own booking search is a cancel list only when the customer recently asked to cancel
 * or a cancel list is pending: the assistant's own "إلغاء" wording or booking confirmations don't count.
 */
function modelSearchIsForCancel(messages: RuntimeGatewayChatRequest["messages"]): boolean {
  if (!customerWantsCancelBooking(messages)) return false;
  const recentUserTexts = messages
    .filter((message) => message.role === "user")
    .slice(-3)
    .map((message) => String(message.content ?? ""));
  if (recentUserTexts.some((text) => /(?:الغي|ألغي|الغى|الغاء|إلغاء|cancel)/i.test(text))) return true;
  const lastAssistant = String(
    [...messages].reverse().find((message) => message.role === "assistant")?.content ?? "",
  );
  return /ممكن إلغاؤه|أنهي موعد تلغي|ده الموعد الوحيد|مش هألغي|which booking should i cancel|welche buchung soll ich stornieren|(?:عشان|علشان|قبل)\s*(?:ألغي|الغي|نلغي|الإلغاء|الالغاء)/iu.test(
    lastAssistant,
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
    status === "checked_in" ||
    status === "with_nurse" ||
    status === "in_progress" ||
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
  const language = customerReplyLanguage(input.sourceMessages);
  if (!bookingReference) {
    pushGuidance(rescheduleAskBookingRef(language), ["RESCHEDULE_BOOKING_REF_REQUIRED"]);
    return;
  }

  const slot =
    parseRescheduleWeekdaySlotFromMessages(input.sourceMessages) ??
    parseSelectedBookingSlot(input.sourceMessages);
  if (!slot) {
    pushGuidance(rescheduleAskSlot(language), ["RESCHEDULE_SLOT_REQUIRED"]);
    return;
  }

  const phone = readPhoneForBookingSearch(input.sourceMessages);
  const trusted = hasTrustedBookingIdentity(input.trustedCustomerId)
    ? input.trustedCustomerId!.trim()
    : null;
  // Trusted WhatsApp/CRM identity satisfies ownership — do not re-ask for phone.
  if (!phone && !trusted) {
    pushGuidance(rescheduleAskPhone(language), ["CUSTOMER_CONTEXT_REQUIRED"]);
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
        customerFacingMessage: rescheduleForceFailure(language),
      },
      durationMs: 0,
    });
  }
}

function rescheduleSuccessText(reference: string, language: CustomerReplyLanguage): string {
  if (language === "en") {
    return reference
      ? `Your booking ${reference} has been rescheduled.`
      : "Your booking has been rescheduled.";
  }
  if (language === "de") {
    return reference
      ? `Deine Buchung ${reference} wurde erfolgreich verschoben.`
      : "Dein Termin wurde erfolgreich verschoben.";
  }
  return reference ? `تم تغيير ميعاد الحجز ${reference} ✅` : "تم تغيير ميعاد الحجز ✅";
}

function rescheduleFailureText(language: CustomerReplyLanguage): string {
  if (language === "en") {
    return "I couldn't reschedule that booking. Please send the booking number and the new time again (for example BK-000028 on 2026-10-20 at 19:00).";
  }
  if (language === "de") {
    return "Dieser Termin konnte nicht verschoben werden. Bitte sende die Buchungsnummer und die neue Uhrzeit erneut (zum Beispiel BK-000028 am 2026-10-20 um 19:00).";
  }
  return "ما قدرناش نغيّر الموعد ده دلوقتي. ابعتي رقم الحجز والموعد الجديد تاني (مثل BK-000028 يوم 2026-10-20 الساعة 19:00).";
}

function rescheduleForceFailure(language: CustomerReplyLanguage): string {
  if (language === "en") {
    return "I couldn't reschedule that booking. Please send the booking number, the new time, and the mobile number again.";
  }
  if (language === "de") {
    return "Dieser Termin konnte nicht verschoben werden. Bitte sende die Buchungsnummer, die neue Uhrzeit und die Mobilnummer erneut.";
  }
  return "ما قدرناش نغيّر ميعاد الحجز ده دلوقتي. ابعتي رقم الحجز والميعاد الجديد ورقم الموبايل تاني.";
}

function applyRescheduleBookingReplyFallback(
  response: RuntimeGatewayChatResponse,
  toolExecutions: ToolCallLoopResult["toolExecutions"],
  messages: RuntimeGatewayChatRequest["messages"] = [],
): RuntimeGatewayChatResponse {
  const language = customerReplyLanguage(messages);
  const last = [...toolExecutions]
    .reverse()
    .find((execution) => execution.toolKey === "reschedule_booking");
  if (!last) return response;
  const facing =
    typeof last.output?.customerFacingMessage === "string"
      ? last.output.customerFacingMessage.trim()
      : "";
  const reference =
    typeof last.output?.reference === "string" ? last.output.reference.trim() : "";
  const rescheduleSucceeded = last.status === "succeeded" && last.output?.success === true;
  if (rescheduleSucceeded) {
    const reply = customerFacingOrLocalized(facing, language, rescheduleSuccessText(reference, language));
    if (reply) return { ...response, text: reply, finishReason: response.finishReason ?? "stop" };
  }
  const claimsRescheduleSuccess =
    /تم\s*(?:تغيير|تعديل|نقل|تأجيل)|has been rescheduled|wurde erfolgreich verschoben/iu.test(response.text);
  if (!rescheduleSucceeded && claimsRescheduleSuccess) {
    return {
      ...response,
      text: customerFacingOrLocalized(facing, language, rescheduleFailureText(language)),
      finishReason: response.finishReason ?? "stop",
    };
  }
  if (
    facing &&
    (!response.text.trim() ||
      /جارٍ التفكير|أعتذر|مشكلة|عمر|رقم الهاتف|رقم التليفون/i.test(response.text) ||
      CREATE_BOOKING_CONTINUE_LEAK.test(response.text))
  ) {
    return {
      ...response,
      text: customerFacingOrLocalized(facing, language, rescheduleFailureText(language)),
      finishReason: response.finishReason ?? "stop",
    };
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
    const language = customerReplyLanguage(messages);
    const textByLanguage = {
      ar: "عشان نغيّر الميعاد، محتاجين نحدد الحجز واليوم والساعة الجديدة (مثل BK-000088 يوم 24-08-2026 الساعة 08:00).",
      en: "To reschedule, I need the booking plus the new day and time (for example BK-000088 on 24-08-2026 at 08:00).",
      de: "Zum Verschieben brauche ich die Buchung plus den neuen Tag und die Uhrzeit (zum Beispiel BK-000088 am 24-08-2026 um 08:00).",
    } as const;
    return {
      ...response,
      text: textByLanguage[language],
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
  const language = customerReplyLanguage(messages);
  if (facing) {
    return {
      ...response,
      text: customerFacingOrLocalized(facing, language, rescheduleFailureText(language)),
      finishReason: response.finishReason ?? "stop",
    };
  }

  const text = response.text.trim();
  if (/تم\s*(?:تغيير|تعديل|نقل|تأجيل)|has been rescheduled|wurde erfolgreich verschoben/iu.test(text)) {
    return {
      ...response,
      text: rescheduleFailureText(language),
      finishReason: response.finishReason ?? "stop",
    };
  }
  if (!text || CREATE_BOOKING_CONTINUE_LEAK.test(text)) {
    if (!parseSelectedBookingSlot(messages)) {
      return {
        ...response,
        text: rescheduleAskSlot(language),
        finishReason: response.finishReason ?? "stop",
      };
    }
    if (!readPhoneForBookingSearch(messages)) {
      return {
        ...response,
        text: rescheduleAskPhone(language),
        finishReason: response.finishReason ?? "stop",
      };
    }
    return {
      ...response,
      text: rescheduleAskBookingRef(language),
      finishReason: response.finishReason ?? "stop",
    };
  }
  return response;
}

type CustomerBooking = {
  reference: string;
  startMs: number;
  timezone: string;
  status: string;
  serviceName: string;
  employeeName: string;
  serviceId: string;
  resourceId: string;
};

type BookingListMode = "all" | "upcoming" | "past" | "next" | "previous" | "latest";

const UPCOMING_BOOKING_STATUSES = new Set(["pending", "confirmed"]);
const BOOKING_LIST_LIMIT = 3;
const PAST_BOOKINGS_HINT = "لو عايز تشوف حجوزاتك اللي فاتت قولّي «حجوزاتي اللي فاتت».";
const RESCHEDULE_PICK_LIMIT = 5;
const RESCHEDULE_DAY_LIMIT = 7;
const RESCHEDULE_SLOT_LIMIT = 12;
const RESCHEDULE_PICK_PROMPTS = {
  ar: "أنهي حجز عايز تغيّر ميعاده؟",
  en: "Which booking should I reschedule?",
  de: "Welche Buchung möchtest du verschieben?",
} as const;
const RESCHEDULE_CONFIRM_PROMPTS = {
  ar: "ده الحجز اللي عايز تغيّر ميعاده؟",
  en: "Is this the booking you want to reschedule?",
  de: "Ist das die Buchung, deren Termin du verschieben möchtest?",
} as const;
const RESCHEDULE_DAY_PROMPTS = {
  ar: "اختار رقم اليوم المناسب",
  en: "Choose a day number",
  de: "Wähle eine Tagesnummer",
} as const;
const RESCHEDULE_SLOT_PROMPTS = {
  ar: "اختار رقم الميعاد الجديد",
  en: "Choose the new time number",
  de: "Wähle die neue Uhrzeit",
} as const;
const RESCHEDULE_PICK_PROMPT = RESCHEDULE_PICK_PROMPTS.ar;
const RESCHEDULE_CONFIRM_PROMPT = RESCHEDULE_CONFIRM_PROMPTS.ar;
const RESCHEDULE_DAY_PROMPT = RESCHEDULE_DAY_PROMPTS.ar;
const RESCHEDULE_SLOT_PROMPT = RESCHEDULE_SLOT_PROMPTS.ar;

function textHasPrompt(text: string, prompts: Record<CustomerReplyLanguage, string>): boolean {
  return Object.values(prompts).some((prompt) => text.includes(prompt));
}

function readCustomerBookings(output: Record<string, unknown> | null): CustomerBooking[] {
  const rows = output && Array.isArray(output.bookings) ? output.bookings : [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const record = row as Record<string, unknown>;
    const text = (key: string) => (typeof record[key] === "string" ? String(record[key]).trim() : "");
    const startMs = Date.parse(text("scheduledAt"));
    if (!Number.isFinite(startMs)) return [];
    return [
      {
        reference: text("reference").toUpperCase(),
        startMs,
        timezone: text("timezone") || "Africa/Cairo",
        status: text("status").toLowerCase(),
        serviceName: text("serviceName"),
        employeeName: text("employeeName"),
        serviceId: text("serviceId"),
        resourceId: text("resourceId"),
      },
    ];
  });
}

function bookingLocalDateTime(booking: CustomerBooking): { date: string; time: string } {
  const format = (timeZone: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(booking.startMs));
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = format(booking.timezone);
  } catch {
    parts = format("Africa/Cairo");
  }
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

function describeCustomerBooking(
  booking: CustomerBooking,
  language: CustomerReplyLanguage = "ar",
): string {
  const withWord = language === "en" ? "with" : language === "de" ? "bei" : "مع";
  return [booking.serviceName, booking.employeeName ? `${withWord} ${booking.employeeName}` : ""].filter(Boolean).join(" ");
}

function customerBookingWhen(
  booking: CustomerBooking,
  language: CustomerReplyLanguage = "ar",
): string {
  const { date, time } = bookingLocalDateTime(booking);
  if (language === "en") return `${date} at ${time}`;
  if (language === "de") return `${date} um ${time}`;
  return `${formatArabicWeekdayDate(date)} الساعة ${formatArabicTime12h(time)}`;
}

function pastBookingStatusLabel(status: string): string {
  if (status === "cancelled" || status === "canceled") return "ملغي";
  if (status === "completed" || status === "checked_out") return "مكتمل";
  if (status === "no_show") return "لم يحضر";
  if (status === "checked_in" || status === "in_progress" || status === "with_nurse") return "تم الحضور";
  return "";
}

function customerBookingLine(
  booking: CustomerBooking,
  index: number,
  nowMs: number,
  language: CustomerReplyLanguage = "ar",
): string {
  const label = booking.startMs <= nowMs ? pastBookingStatusLabel(booking.status) : "";
  const missing = language === "en" ? "booking" : language === "de" ? "Buchung" : "حجز";
  return [
    `${index + 1}) ${booking.reference || missing}`,
    describeCustomerBooking(booking, language),
    customerBookingWhen(booking, language),
    label,
  ]
    .filter(Boolean)
    .join(" | ");
}

function customerBookingCard(title: string, booking: CustomerBooking, nowMs: number): string {
  const label = booking.startMs <= nowMs ? pastBookingStatusLabel(booking.status) : "";
  return [
    title,
    booking.reference ? `رقم الحجز: ${booking.reference}` : "",
    describeCustomerBooking(booking),
    customerBookingWhen(booking),
    label ? `الحالة: ${label}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function upcomingCustomerBookings(bookings: CustomerBooking[], nowMs: number): CustomerBooking[] {
  return bookings
    .filter((booking) => booking.startMs > nowMs && UPCOMING_BOOKING_STATUSES.has(booking.status))
    .sort((left, right) => left.startMs - right.startMs);
}

function pastCustomerBookings(bookings: CustomerBooking[], nowMs: number): CustomerBooking[] {
  return bookings.filter((booking) => booking.startMs <= nowMs).sort((left, right) => right.startMs - left.startMs);
}

function bookingReferenceNumber(booking: CustomerBooking): number {
  return Number(booking.reference.replace(/\D/g, "")) || 0;
}

function latestMadeBooking(bookings: CustomerBooking[]): CustomerBooking | null {
  return [...bookings].sort((left, right) => bookingReferenceNumber(right) - bookingReferenceNumber(left))[0] ?? null;
}

function mentionsLastBooking(text: string): boolean {
  return /(?:^|\s)(?:ال)?(?:اخر|آخر|أخر|الاخير|الأخير)(?:\s|$)/u.test(text);
}

function bookingListMode(text: string): BookingListMode | null {
  const folded = foldArabicRelativeDateText(text).trim();
  if (!folded) return null;
  if (customerWantsToMoveBooking(text) || /(?:الغي|الغى|الغاء|cancel)/iu.test(folded)) return null;
  if (looksLikeFreshBookingRequest(text) || /(?:^|\s)[اهن]حجز/u.test(folded)) return null;
  const plural = /(?:حجوزات|مواعيد)/u.test(folded);
  const future = /(?:الجاي|الجايه|اللي جاي|اللي جايه|القادم|القادمه|المستقبل)/u.test(folded);
  const before = /(?:اللي فات|اللي فاتت|الفايت|الفايته|السابق|السابقه|الماضي|الماضيه|القديم|القديمه)/u.test(folded);
  const asksOwn =
    /(?:^|\s)(?:حجوزاتي|مواعيدي|ميعادي|موعدي|معادي|حجزي)(?:\s|$|[?؟.!])|(?:حجوزات|حجز|مواعيد|موعد|ميعاد|معاد)\S*\s+(?:اللي\s+)?(?:عندي|ليا|بتاعتي|بتاعي|بتوعي)|عندي\s+(?:اي\s+)?(?:حجوزات|حجز|مواعيد|موعد|ميعاد|معاد)/u.test(
      folded,
    );
  const asksLast = /(?:اخر|الاخير)\s+(?:حجز|موعد|ميعاد|معاد)|(?:حجز|موعد|ميعاد|معاد)\s+(?:اخير|الاخير)/u.test(folded);
  if (!asksOwn && !asksLast && !(plural && (future || before) && /(?:ايه|امتي|فين|قولي|اعرف|اشوف|عايز|عاوز)/u.test(folded))) {
    return null;
  }
  if (future) return plural ? "upcoming" : "next";
  if (before) return plural ? "past" : "previous";
  if (asksLast) return "latest";
  return "all";
}

function bookingListReply(bookings: CustomerBooking[], mode: BookingListMode, nowMs: number): string {
  const upcoming = upcomingCustomerBookings(bookings, nowMs);
  const past = pastCustomerBookings(bookings, nowMs);
  const section = (title: string, rows: CustomerBooking[]) =>
    [title, ...rows.slice(0, BOOKING_LIST_LIMIT).map((booking, index) => customerBookingLine(booking, index, nowMs))].join(
      "\n",
    );
  if (mode === "next") {
    return upcoming[0] ? customerBookingCard("حجزك الجاي:", upcoming[0], nowMs) : "مفيش عندك حجوزات جاية.";
  }
  if (mode === "previous") {
    return past[0] ? customerBookingCard("آخر حجز فات:", past[0], nowMs) : "مفيش عندك حجوزات سابقة.";
  }
  if (mode === "latest") {
    const latest = latestMadeBooking(bookings);
    return latest ? customerBookingCard("آخر حجز عملته:", latest, nowMs) : "مفيش حجوزات مسجّلة باسمك.";
  }
  if (mode === "past") {
    return past.length > 0 ? section("حجوزاتك السابقة:", past) : "مفيش عندك حجوزات سابقة.";
  }
  const parts: string[] = [];
  if (upcoming.length > 0) {
    parts.push(section("حجوزاتك الجاية:", upcoming));
    if (upcoming.length > BOOKING_LIST_LIMIT) parts.push(`وعندك كمان ${upcoming.length - BOOKING_LIST_LIMIT} حجز جاي.`);
  } else {
    parts.push("مفيش عندك حجوزات جاية.");
  }
  if (past.length > 0) parts.push(PAST_BOOKINGS_HINT);
  return parts.join("\n\n");
}

function customerWantsToMoveBooking(text: string): boolean {
  return (
    customerWantsRescheduleFromText(text) ||
    /(?:^|\s)(?:استبدل|ابدل|أبدل|بدّل|بدل|انقل|أنقل|أأجل|اأجل|أجّل|اجل|أجل)\s+(?:\S+\s+){0,3}?(?:ال)?(?:حجز|موعد|ميعاد|معاد)/u.test(
      text,
    )
  );
}

function lastAssistantText(messages: RuntimeGatewayChatRequest["messages"]): string {
  const last = [...messages].reverse().find((message) => message.role === "assistant");
  return typeof last?.content === "string" ? last.content : "";
}

function isAffirmativeReply(text: string): boolean {
  return /^(?:ايوه|أيوه|ايوة|أيوة|ايوا|اه|آه|نعم|تمام|صح|مظبوط|بالظبط|اكيد|أكيد|موافق|ماشي|هو ده|yes|ok|okay|ja)(?:\s|$)/iu.test(
    stripTrailingChatPunctuation(text),
  );
}

function isNegativeReply(text: string): boolean {
  return /^(?:لا|لأ|لاء|no|nein|مش ده|مش هو)(?:\s|$)/iu.test(stripTrailingChatPunctuation(text));
}

/** Bookings narrowed by a provider or service the customer named; null when nothing was named. */
function bookingsNamedInText(
  text: string,
  bookings: CustomerBooking[],
  messages: RuntimeGatewayChatRequest["messages"],
): { label: string; bookings: CustomerBooking[] } | null {
  const providerNames = [
    ...bookings.map((booking) => booking.employeeName),
    ...listCatalogProviderLinks(messages).map((link) => link.name),
  ];
  const [provider] = namesMentionedInText(text, providerNames);
  const normalized = normalizeSchedulingCatalogLabel(text);
  const service = [
    ...new Set([...bookings.map((booking) => booking.serviceName), ...listCatalogServices(messages).map((row) => row.name)]),
  ]
    .filter((name) => name && normalized.includes(normalizeSchedulingCatalogLabel(name)))
    .sort((left, right) => right.length - left.length)[0];
  if (!provider && !service) return null;
  return {
    label: [service, provider ? `مع ${provider}` : ""].filter(Boolean).join(" "),
    bookings: bookings.filter(
      (booking) =>
        (!provider || nameMatchKey(booking.employeeName) === nameMatchKey(provider)) &&
        (!service || normalizeSchedulingCatalogLabel(booking.serviceName) === normalizeSchedulingCatalogLabel(service)),
    ),
  };
}

function rescheduleConfirmReply(
  booking: CustomerBooking,
  language: CustomerReplyLanguage = "ar",
): string {
  const intro =
    language === "en"
      ? `I found your booking ${booking.reference}:`
      : language === "de"
        ? `Ich habe deine Buchung ${booking.reference} gefunden:`
        : `لقيت حجزك ${booking.reference}:`;
  return [
    intro,
    describeCustomerBooking(booking, language),
    customerBookingWhen(booking, language),
    RESCHEDULE_CONFIRM_PROMPTS[language],
  ]
    .filter(Boolean)
    .join("\n");
}

function reschedulePickReply(
  bookings: CustomerBooking[],
  nowMs: number,
  intro?: string,
  language: CustomerReplyLanguage = "ar",
): string {
  const hint =
    language === "en"
      ? "Reply with a list number or the booking number."
      : language === "de"
        ? "Antworte mit einer Listennummer oder der Buchungsnummer."
        : "ابعت رقم من القائمة أو رقم الحجز.";
  return [
    intro,
    RESCHEDULE_PICK_PROMPTS[language],
    ...bookings.slice(0, RESCHEDULE_PICK_LIMIT).map((booking, index) => customerBookingLine(booking, index, nowMs, language)),
    hint,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Which booking to move: the one named by BK, list number, provider/service, or the latest one made. */
function rescheduleTargetReply(
  text: string,
  candidates: CustomerBooking[],
  messages: RuntimeGatewayChatRequest["messages"],
  nowMs: number,
  language: CustomerReplyLanguage = "ar",
): string {
  if (candidates.length === 0) {
    if (language === "en") return "You don't have an upcoming booking I can reschedule.";
    if (language === "de") return "Du hast keine kommende Buchung, die ich verschieben kann.";
    return "مفيش عندك حجوزات جاية نقدر نغيّر ميعادها.";
  }
  const reference = extractBookingReference(text);
  if (reference) {
    const booking = candidates.find((row) => row.reference === reference);
    const wrong =
      language === "en"
        ? `Booking ${reference} is not one of your upcoming bookings.`
        : language === "de"
          ? `Die Buchung ${reference} gehört nicht zu deinen kommenden Buchungen.`
          : `الحجز ${reference} مش من حجوزاتك الجاية.`;
    return booking
      ? rescheduleConfirmReply(booking, language)
      : reschedulePickReply(candidates, nowMs, wrong, language);
  }
  const named = bookingsNamedInText(text, candidates, messages);
  if (named && named.bookings.length === 0) {
    const miss =
      language === "en"
        ? `You don't have an upcoming booking for ${named.label}.`
        : language === "de"
          ? `Du hast keine kommende Buchung für ${named.label}.`
          : `مفيش عندك حجز جاي ${named.label}.`;
    return reschedulePickReply(candidates, nowMs, miss, language);
  }
  const pool = named?.bookings ?? candidates;
  if (pool.length === 1 || mentionsLastBooking(text)) {
    const target = latestMadeBooking(pool);
    if (target) return rescheduleConfirmReply(target, language);
  }
  return reschedulePickReply(pool, nowMs, undefined, language);
}

function rescheduleSlotLine(
  index: number,
  date: string,
  start: string,
  language: CustomerReplyLanguage = "ar",
): string {
  if (language === "ar") return `${index + 1}) ${formatAvailabilityDay(date)} الساعة ${formatArabicTime12h(start)}`;
  return `${index + 1}) ${date} ${start}`;
}

function parseOfferedRescheduleSlots(text: string): Array<{ date: string; slotStart: string } | undefined> {
  const slots: Array<{ date: string; slotStart: string } | undefined> = [];
  for (const line of text.split("\n")) {
    const iso = /^\s*(\d+)\)\s+(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})\b/u.exec(line);
    if (iso) {
      slots[Number(iso[1]) - 1] = { date: `${iso[2]}-${iso[3]}-${iso[4]}`, slotStart: `${iso[5]}:${iso[6]}` };
      continue;
    }
    const match = /^\s*(\d+)\)\s*\S+\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+الساعة\s+(\d{1,2}):(\d{2})\s*(صباحًا|ظهرًا|مساءً)/u.exec(
      line,
    );
    if (!match) continue;
    const hour = (Number(match[5]) % 12) + (match[7] === "صباحًا" ? 0 : 12);
    slots[Number(match[1]) - 1] = {
      date: `${match[4]}-${match[3]!.padStart(2, "0")}-${match[2]!.padStart(2, "0")}`,
      slotStart: `${String(hour).padStart(2, "0")}:${match[6]}`,
    };
  }
  return slots;
}

function pickOfferedRescheduleSlot(
  text: string,
  offered: Array<{ date: string; slotStart: string } | undefined>,
): { date: string; slotStart: string } | null {
  const ascii = stripTrailingChatPunctuation(convertArabicDigitsToAscii(text));
  const number = /^(?:رقم\s*)?(\d{1,2})$/u.exec(ascii);
  if (number) return offered[Number(number[1]) - 1] ?? null;
  const time = parseArabicClockToSlotStart(text);
  if (!time) return null;
  const listed = offered.filter((slot): slot is { date: string; slotStart: string } => Boolean(slot));
  const date = matchChosenAvailabilityDate(text, [...new Set(listed.map((slot) => slot.date))]);
  const hits = listed.filter((slot) => slot.slotStart === time && (!date || slot.date === date));
  return hits.length === 1 ? hits[0]! : null;
}

function requestedRescheduleDate(text: string): string | null {
  if (hasArabicTomorrowToken(text)) return cairoCalendarYmd(1);
  if (hasArabicTodayToken(text)) return cairoCalendarYmd(0);
  const upcomingDates = Array.from({ length: 30 }, (_, offset) => cairoCalendarYmd(offset));
  return matchChosenAvailabilityDate(text, upcomingDates);
}

function parseOfferedRescheduleDays(text: string): Array<string | undefined> {
  const days: Array<string | undefined> = [];
  for (const line of text.split("\n")) {
    const iso = /^\s*(\d+)\)\s+(\d{4})-(\d{2})-(\d{2})(?!\s+\d{2}:\d{2})/u.exec(line);
    if (iso) {
      days[Number(iso[1]) - 1] = `${iso[2]}-${iso[3]}-${iso[4]}`;
      continue;
    }
    const match = /^\s*(\d+)\)\s*\S+\s+(\d{1,2})\/(\d{1,2})\/(\d{4})(?!\s+الساعة)/u.exec(line);
    if (!match) continue;
    days[Number(match[1]) - 1] = `${match[4]}-${match[3]!.padStart(2, "0")}-${match[2]!.padStart(2, "0")}`;
  }
  return days;
}

type DayPeriod = "morning" | "evening";

function requestedDayPeriod(text: string): DayPeriod | null {
  const folded = foldArabicRelativeDateText(text);
  if (/(?:مساء|مسائ|مسا(?:\s|$|[?؟!.])|بالليل|بليل|الليل|العصر|بعد\s+(?:الضهر|الظهر)|evening|night)/iu.test(folded)) {
    return "evening";
  }
  if (/(?:صباح|الصبح|صبحا|بدري|morning)/iu.test(folded)) return "morning";
  return null;
}

function slotInPeriod(start: string, period: DayPeriod | null): boolean {
  if (!period) return true;
  const hour = Number(start.slice(0, 2));
  return period === "morning" ? hour < 12 : hour >= 12;
}

function dayPeriodLabel(period: DayPeriod): string {
  return period === "morning" ? "صباحية" : "مسائية";
}

async function rescheduleOpenSlots(
  input: CustomerBookingsInput,
  booking: CustomerBooking,
  date: string | null,
  period: DayPeriod | null,
): Promise<ListedAvailabilitySlot[]> {
  const output = await routeCustomerBookingTool(input, "search_availability", {
    serviceId: booking.serviceId,
    ...(booking.resourceId ? { resourceId: booking.resourceId } : {}),
    ...(date ? { date } : { daysAhead: RESCHEDULE_DAY_LIMIT }),
  });
  const current = bookingLocalDateTime(booking);
  return collectAvailabilitySlots(output)
    .filter((slot) => !(slot.date === current.date && slot.start.slice(0, 5) === current.time))
    .filter((slot) => (!date || slot.date === date) && slotInPeriod(slot.start, period))
    .sort((left, right) => `${left.date} ${left.start}`.localeCompare(`${right.date} ${right.start}`));
}

/** First step of moving a booking: the days that still have room, then the customer picks one. */
async function rescheduleDaysReply(
  input: CustomerBookingsInput,
  booking: CustomerBooking,
  period: DayPeriod | null = null,
  intro?: string,
  language: CustomerReplyLanguage = "ar",
): Promise<string> {
  const slots = await rescheduleOpenSlots(input, booking, null, period);
  const byDay = new Map<string, string[]>();
  for (const slot of slots) byDay.set(slot.date, [...(byDay.get(slot.date) ?? []), slot.start.slice(0, 5)]);
  const days = [...byDay.entries()].slice(0, RESCHEDULE_DAY_LIMIT);
  const who = describeCustomerBooking(booking, language);
  if (language !== "ar") {
    const empty =
      language === "de"
        ? `Diese Woche sind keine freien Termine${who ? ` für ${who}` : ""}. Sende den Tag, der dir passt.`
        : `There are no open times this week${who ? ` for ${who}` : ""}. Send the day that works for you.`;
    if (days.length === 0) return [intro, empty].filter(Boolean).join("\n");
    const heading =
      language === "de"
        ? `Freie Tage zum Verschieben der Buchung ${booking.reference}${who ? ` (${who})` : ""}:`
        : `Open days to reschedule booking ${booking.reference}${who ? ` (${who})` : ""}:`;
    const hint =
      language === "de"
        ? `${RESCHEDULE_DAY_PROMPTS.de}, oder nenne den Tag.`
        : `${RESCHEDULE_DAY_PROMPTS.en}, or send the day.`;
    return [
      intro,
      heading,
      ...days.map(([date, times], index) => {
        const range = times.length === 1 ? times[0]! : `${times[0]}–${times[times.length - 1]}`;
        return `${index + 1}) ${date} (${range})`;
      }),
      hint,
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (days.length === 0) {
    return [
      intro,
      `مفيش مواعيد${period ? ` ${dayPeriodLabel(period)}` : ""} فاضية الأسبوع ده${who ? ` لـ${who}` : ""}. ابعت اليوم اللي يناسبك.`,
    ]
      .filter(Boolean)
      .join("\n");
  }
  return [
    intro,
    `الأيام المتاحة${period ? ` (مواعيد ${dayPeriodLabel(period)})` : ""} لتغيير ميعاد الحجز ${booking.reference}${who ? ` (${who})` : ""}:`,
    ...days.map(([date, times], index) => {
      const range =
        times.length === 1
          ? formatArabicTime12h(times[0]!)
          : `من ${formatArabicTime12h(times[0]!)} لحد ${formatArabicTime12h(times[times.length - 1]!)}`;
      return `${index + 1}) ${formatAvailabilityDay(date)} (${range})`;
    }),
    `${RESCHEDULE_DAY_PROMPT}، أو ابعت اسم اليوم.`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function routeCustomerBookingTool(
  input: CustomerBookingsInput,
  toolKey: string,
  toolInput: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const routed = await input.tools.route(input.ctx, {
    conversationId: input.conversationId,
    toolKey,
    input: toolInput,
    triggeredBy: "agent",
  });
  input.toolExecutions.push({
    toolKey: routed.toolKey,
    executionId: routed.executionId,
    status: routed.status,
    output: routed.output,
    durationMs: routed.durationMs,
  });
  return routed.output ?? null;
}

async function loadCustomerBookings(input: CustomerBookingsInput): Promise<CustomerBooking[] | null> {
  const output = await routeCustomerBookingTool(input, "search_bookings", {
    purpose: "list",
    daysBack: 365,
    trustedCustomerId: input.trustedCustomerId,
  });
  return output?.success === true ? readCustomerBookings(output) : null;
}

/** Second step of moving a booking: the free times on the day the customer picked. */
async function rescheduleSlotsReply(
  input: CustomerBookingsInput,
  booking: CustomerBooking,
  date: string,
  intro?: string,
  period: DayPeriod | null = null,
  language: CustomerReplyLanguage = "ar",
): Promise<string> {
  const slots = await rescheduleOpenSlots(input, booking, date, period);
  const chosen = slots.slice(0, RESCHEDULE_SLOT_LIMIT);
  const who = describeCustomerBooking(booking, language);
  if (chosen.length === 0) {
    const empty =
      language === "en"
        ? `There are no open times on ${date}.`
        : language === "de"
          ? `Am ${date} sind keine Termine frei.`
          : `مفيش مواعيد${period ? ` ${dayPeriodLabel(period)}` : ""} فاضية يوم ${formatAvailabilityDay(date)}.`;
    return rescheduleDaysReply(input, booking, period, [intro, empty].filter(Boolean).join("\n"), language);
  }
  if (language !== "ar") {
    const heading =
      language === "de"
        ? `Freie Termine am ${date} für Buchung ${booking.reference}${who ? ` (${who})` : ""}:`
        : `Open times on ${date} for booking ${booking.reference}${who ? ` (${who})` : ""}:`;
    const more =
      language === "de"
        ? `Es gibt noch ${slots.length - chosen.length} weitere Zeiten an diesem Tag.`
        : `There are ${slots.length - chosen.length} more times on the same day.`;
    const hint =
      language === "de"
        ? `${RESCHEDULE_SLOT_PROMPTS.de}, oder nenne einen anderen Tag.`
        : `${RESCHEDULE_SLOT_PROMPTS.en}, or send another day.`;
    return [
      intro,
      heading,
      ...chosen.map((slot, index) => rescheduleSlotLine(index, slot.date, slot.start.slice(0, 5), language)),
      slots.length > chosen.length ? more : "",
      hint,
    ]
      .filter(Boolean)
      .join("\n");
  }
  return [
    intro,
    `المواعيد المتاحة يوم ${formatAvailabilityDay(date)} للحجز ${booking.reference}${who ? ` (${who})` : ""}:`,
    ...chosen.map((slot, index) => rescheduleSlotLine(index, slot.date, slot.start.slice(0, 5))),
    slots.length > chosen.length ? `وفيه كمان ${slots.length - chosen.length} ميعاد في نفس اليوم، ابعت الساعة اللي تناسبك.` : "",
    `${RESCHEDULE_SLOT_PROMPT}، أو ابعت يوم تاني.`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function moveCustomerBooking(
  input: CustomerBookingsInput,
  booking: CustomerBooking,
  slot: { date: string; slotStart: string },
): Promise<string> {
  const output = await routeCustomerBookingTool(input, "reschedule_booking", {
    bookingId: booking.reference,
    bookingReference: booking.reference,
    date: slot.date,
    slotStart: slot.slotStart,
    trustedCustomerId: input.trustedCustomerId,
  });
  const language = customerReplyLanguage(input.sourceMessages);
  if (output?.success === true) {
    const when =
      language === "en"
        ? `${slot.date} at ${slot.slotStart}`
        : language === "de"
          ? `${slot.date} um ${slot.slotStart}`
          : `${formatArabicWeekdayDate(slot.date)} الساعة ${formatArabicTime12h(slot.slotStart)}`;
    const heading =
      language === "en"
        ? `Your booking ${booking.reference} has been rescheduled.`
        : language === "de"
          ? `Deine Buchung ${booking.reference} wurde erfolgreich verschoben.`
          : `تم تغيير ميعاد الحجز ${booking.reference} ✅`;
    const whenLine =
      language === "en" ? `New time: ${when}` : language === "de" ? `Neue Zeit: ${when}` : `الميعاد الجديد: ${when}`;
    return [heading, describeCustomerBooking(booking, language), whenLine].filter(Boolean).join("\n");
  }
  const fallback =
    language === "en"
      ? "I couldn't change that time."
      : language === "de"
        ? "Diese Uhrzeit konnte nicht geändert werden."
        : "ما قدرناش نغيّر الميعاد ده.";
  const facing =
    typeof output?.customerFacingMessage === "string" ? output.customerFacingMessage.trim() : "";
  return rescheduleSlotsReply(
    input,
    booking,
    slot.date,
    customerFacingOrLocalized(facing, language, fallback),
    null,
    language,
  );
}

type CustomerBookingsInput = {
  tools: RuntimeToolPort;
  ctx: ServiceContext;
  conversationId: string;
  allowedToolKeys: string[];
  sourceMessages: RuntimeGatewayChatRequest["messages"];
  toolExecutions: ToolCallLoopResult["toolExecutions"];
  trustedCustomerId: string;
};

/**
 * Customer's own bookings: list them (3 upcoming / 3 past at most), or move one to a new time.
 * Moving goes: find the booking → customer confirms its number → pick a new slot → reschedule_booking.
 */
function latestUserMessageLooksLikePhone(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return false;
  return /^[\d\s+\-().]+$/.test(trimmed) || /(?:موبايل|هاتف|رقم|phone|mobile)/i.test(trimmed);
}

function identityPhoneMismatchClarification(language: "ar" | "en" | "de"): string {
  if (language === "en") {
    return "That phone number does not match the verified customer on this chat. Tell me clearly if you want to continue with this conversation's number, or ask a staff member to verify a different identity — I will not show bookings based on a different number.";
  }
  if (language === "de") {
    return "Diese Telefonnummer stimmt nicht mit dem verifizierten Kunden in diesem Chat überein. Sagen Sie klar, ob wir mit der Chat-Nummer weitermachen sollen, oder lassen Sie eine andere Identität vom Personal prüfen — ich zeige keine Buchungen aufgrund einer anderen Nummer.";
  }
  return "الرقم اللي بعتّه مش مطابق لرقم المحادثة الموثّق. وضّح لو حابب نكمل برقم الشات ده، أو ابعت بيانات التحقق من لوحة التحكم — مش هعرض حجوزات بناءً على رقم مختلف.";
}

async function customerBookingsReply(input: Omit<CustomerBookingsInput, "trustedCustomerId"> & {
  trustedCustomerId?: string | null;
}): Promise<string | null> {
  if (!hasTrustedBookingIdentity(input.trustedCustomerId)) return null;
  // Ticket status/comment/change turns must never be answered with booking lists.
  if (customerWantsAnyTicketFlow(input.sourceMessages)) return null;
  const allowed = new Set([
    ...input.allowedToolKeys,
    ...(typeof input.tools.allowedToolKeys === "function" ? input.tools.allowedToolKeys() : []),
  ]);
  if (!allowed.has("search_bookings")) return null;
  const canMove = allowed.has("reschedule_booking") && allowed.has("search_availability");
  const scoped: CustomerBookingsInput = { ...input, trustedCustomerId: input.trustedCustomerId!.trim() };
  const latest = latestUserTextFromMessages(input.sourceMessages);
  const assistant = lastAssistantText(input.sourceMessages);
  const language = customerReplyLanguage(input.sourceMessages);
  // Phone in the latest turn under a trusted conversation is never proof of ownership.
  // Fail closed with clarification instead of listing the conversation owner's bookings —
  // including when the customer also says «حجوزاتي» alongside a different number.
  if (latestUserMessageLooksLikePhone(latest) || Boolean(extractPhoneFromText(latest))) {
    return identityPhoneMismatchClarification(language);
  }
  const nowMs = Date.now();
  const bookingGone =
    language === "en"
      ? "That booking is no longer one of your upcoming bookings, so it can't be rescheduled."
      : language === "de"
        ? "Diese Buchung gehört nicht mehr zu deinen kommenden Buchungen und kann nicht verschoben werden."
        : "الحجز ده مبقاش من حجوزاتك الجاية، فمش هينفع نغيّر ميعاده.";
  const badNumber =
    language === "en"
      ? "That number is not in the list."
      : language === "de"
        ? "Diese Nummer steht nicht in der Liste."
        : "الرقم ده مش في القائمة.";
  const needDay =
    language === "en"
      ? "Tell me the day first, then we can choose the time."
      : language === "de"
        ? "Nenne zuerst den Tag, danach wählen wir die Uhrzeit."
        : "قولّي اليوم الأول، وبعدها نختار الساعة.";
  const unavailable =
    language === "en"
      ? "That time is not available."
      : language === "de"
        ? "Diese Uhrzeit ist nicht frei."
        : "الساعة دي مش متاحة.";
  const assistantReference = extractBookingReference(assistant);
  const upcomingBooking = async (reference: string) => {
    const bookings = await loadCustomerBookings(scoped);
    return bookings ? upcomingCustomerBookings(bookings, nowMs).find((row) => row.reference === reference) ?? null : null;
  };

  const moveToRequestedTime = async (booking: CustomerBooking, date: string, time: string) => {
    const open = (await rescheduleOpenSlots(scoped, booking, date, null)).some(
      (slot) => slot.start.slice(0, 5) === time,
    );
    if (open) return moveCustomerBooking(scoped, booking, { date, slotStart: time });
    return rescheduleSlotsReply(scoped, booking, date, unavailable, null, language);
  };

  if (canMove && assistantReference && textHasPrompt(assistant, RESCHEDULE_DAY_PROMPTS) && !customerWantsToMoveBooking(latest)) {
    const offeredDays = parseOfferedRescheduleDays(assistant);
    const number = /^(?:رقم\s*|يوم\s*)?(\d{1,2})$/u.exec(stripTrailingChatPunctuation(convertArabicDigitsToAscii(latest)));
    const listedDays = offeredDays.filter((day): day is string => Boolean(day));
    const date = number
      ? offeredDays[Number(number[1]) - 1] ?? null
      : matchChosenAvailabilityDate(latest, listedDays) ?? requestedRescheduleDate(latest);
    const time = number ? null : parseArabicClockToSlotStart(latest);
    const period = requestedDayPeriod(latest);
    if (date || time || period || number) {
      const booking = await upcomingBooking(assistantReference);
      if (!booking) return bookingGone;
      if (!date && number) return rescheduleDaysReply(scoped, booking, null, badNumber, language);
      if (!date && time) return rescheduleDaysReply(scoped, booking, period, needDay, language);
      if (!date) return rescheduleDaysReply(scoped, booking, period, undefined, language);
      if (time) return moveToRequestedTime(booking, date, time);
      return rescheduleSlotsReply(scoped, booking, date, undefined, period, language);
    }
  }

  if (canMove && assistantReference && textHasPrompt(assistant, RESCHEDULE_SLOT_PROMPTS) && !customerWantsToMoveBooking(latest)) {
    const offered = parseOfferedRescheduleSlots(assistant);
    const offeredDates = [...new Set(offered.flatMap((slot) => (slot ? [slot.date] : [])))];
    const picked = pickOfferedRescheduleSlot(latest, offered);
    const requestedDate = picked ? null : requestedRescheduleDate(latest);
    const requestedTime = picked ? null : parseArabicClockToSlotStart(latest);
    const period = picked ? null : requestedDayPeriod(latest);
    if (picked || requestedDate || requestedTime || period) {
      const booking = await upcomingBooking(assistantReference);
      if (!booking) return bookingGone;
      if (picked) return moveCustomerBooking(scoped, booking, picked);
      const date = requestedDate ?? (offeredDates.length === 1 ? offeredDates[0]! : null);
      if (!date) return rescheduleDaysReply(scoped, booking, period, needDay, language);
      if (requestedTime) return moveToRequestedTime(booking, date, requestedTime);
      return rescheduleSlotsReply(scoped, booking, date, undefined, period, language);
    }
  }

  if (canMove && assistantReference && textHasPrompt(assistant, RESCHEDULE_CONFIRM_PROMPTS)) {
    if (isAffirmativeReply(latest)) {
      const booking = await upcomingBooking(assistantReference);
      if (!booking) return bookingGone;
      return rescheduleDaysReply(scoped, booking, requestedDayPeriod(latest), undefined, language);
    }
    if (isNegativeReply(latest)) {
      const bookings = await loadCustomerBookings(scoped);
      if (!bookings) return null;
      return rescheduleTargetReply("", upcomingCustomerBookings(bookings, nowMs), input.sourceMessages, nowMs, language);
    }
  }

  if (canMove && textHasPrompt(assistant, RESCHEDULE_PICK_PROMPTS) && !customerWantsToMoveBooking(latest)) {
    const listed = assistant.match(/\bBK-\d+\b/gi)?.map((reference) => reference.toUpperCase()) ?? [];
    const number = /^(?:رقم\s*)?(\d{1,2})$/u.exec(stripTrailingChatPunctuation(convertArabicDigitsToAscii(latest)));
    const reference = number ? listed[Number(number[1]) - 1] : extractBookingReference(latest);
    if (reference || bookingsNamedInText(latest, [], input.sourceMessages) || mentionsLastBooking(latest)) {
      const bookings = await loadCustomerBookings(scoped);
      if (!bookings) return null;
      return rescheduleTargetReply(reference ?? latest, upcomingCustomerBookings(bookings, nowMs), input.sourceMessages, nowMs, language);
    }
  }

  const answersReferenceAsk =
    assistantAskedRescheduleReference(assistant) &&
    (mentionsLastBooking(latest) || Boolean(bookingsNamedInText(latest, [], input.sourceMessages)));
  if (canMove && (customerWantsToMoveBooking(latest) || answersReferenceAsk)) {
    // BK + new time in one message is already handled by the direct reschedule path.
    if (extractBookingReference(latest) && parseArabicClockToSlotStart(latest)) return null;
    const bookings = await loadCustomerBookings(scoped);
    if (!bookings) return null;
    return rescheduleTargetReply(latest, upcomingCustomerBookings(bookings, nowMs), input.sourceMessages, nowMs, language);
  }

  const mode = bookingListMode(latest);
  if (mode) {
    const bookings = await loadCustomerBookings(scoped);
    if (!bookings) return null;
    const named = bookingsNamedInText(latest, bookings, input.sourceMessages);
    return bookingListReply(named?.bookings ?? bookings, mode, nowMs);
  }
  return null;
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

function cancelSuccessText(reference: string, language: CustomerReplyLanguage): string {
  if (language === "en") {
    return reference
      ? `Your booking ${reference} has been cancelled successfully.`
      : "Your booking has been cancelled successfully.";
  }
  if (language === "de") {
    return reference
      ? `Deine Buchung ${reference} wurde erfolgreich storniert.`
      : "Deine Buchung wurde erfolgreich storniert.";
  }
  return reference ? `تم إلغاء الحجز ${reference} بنجاح.` : "تم إلغاء الحجز بنجاح.";
}

function cancelFailureText(language: CustomerReplyLanguage): string {
  if (language === "en") {
    return "I couldn't cancel that booking. Please send the booking number again (for example BK-000028).";
  }
  if (language === "de") {
    return "Diese Buchung konnte nicht storniert werden. Bitte senden Sie die Buchungsnummer erneut (zum Beispiel BK-000028).";
  }
  return "ما قدرناش نلغي الحجز ده دلوقتي. ابعتي رقم الحجز تاني (مثل BK-000028).";
}

function customerFacingOrLocalized(
  facing: string,
  language: CustomerReplyLanguage,
  localized: string,
): string {
  if (!facing) return localized;
  if (language !== "ar" && /[\u0600-\u06FF]/.test(facing)) return localized;
  return facing;
}

function readCancelBookingReply(
  output: Record<string, unknown> | null,
  language: CustomerReplyLanguage = "ar",
): string | null {
  if (!output || output.success !== true) return null;
  const reference = typeof output.reference === "string" ? output.reference.trim() : "";
  const customerFacingMessage = output.customerFacingMessage;
  const facing = typeof customerFacingMessage === "string" ? customerFacingMessage.trim() : "";
  return customerFacingOrLocalized(facing, language, cancelSuccessText(reference, language));
}

function applyCancelBookingReplyFallback(
  response: RuntimeGatewayChatResponse,
  toolExecutions: ToolCallLoopResult["toolExecutions"],
  messages: RuntimeGatewayChatRequest["messages"] = [],
): RuntimeGatewayChatResponse {
  const language = customerReplyLanguage(messages);
  const text = response.text.trim();
  const claimsCancelSuccess =
    /تم\s*إلغاء\s*(?:الحجز|الموعد)|has been cancelled successfully|wurde erfolgreich storniert/i.test(text);

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
      text: customerFacingOrLocalized(failureMessage, language, cancelFailureText(language)),
      finishReason: response.finishReason ?? "stop",
    };
  }

  if (!lastCancel) return response;

  if (lastCancel.status === "succeeded" && lastCancel.output?.success === true) {
    const reply = readCancelBookingReply(lastCancel.output ?? null, language);
    if (!reply) return response;
    return {
      ...response,
      text: reply,
      finishReason: response.finishReason ?? "stop",
    };
  }

  const failureMessage =
    typeof lastCancel.output?.customerFacingMessage === "string"
      ? lastCancel.output.customerFacingMessage.trim()
      : "";
  if (failureMessage || lastCancel.status === "failed" || lastCancel.output?.success === false) {
    return {
      ...response,
      text: customerFacingOrLocalized(failureMessage, language, cancelFailureText(language)),
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

  const lastMismatch = [...toolExecutions]
    .reverse()
    .find((execution) => {
      if (execution.toolKey !== "search_bookings") return false;
      const errors = execution.output?.errors;
      return Array.isArray(errors) && errors.includes("IDENTITY_PHONE_MISMATCH");
    });
  if (lastMismatch) {
    const facing =
      typeof lastMismatch.output?.customerFacingMessage === "string" &&
      lastMismatch.output.customerFacingMessage.trim()
        ? lastMismatch.output.customerFacingMessage.trim()
        : identityPhoneMismatchClarification(customerReplyLanguage(messages));
    return {
      ...response,
      text: facing,
      finishReason: response.finishReason ?? "stop",
    };
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
  const reply = readSearchBookingsReply(lastSearch.output ?? null, customerReplyLanguage(messages));
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
  trustedCustomerId?: string | null;
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

  const parsedPhone = readPhoneForBookingSearch(input.sourceMessages);
  const latestDigits = latestUserText.replace(/\D/g, "");
  const latestIsPhone = latestUserMessageLooksLikePhone(latestUserText);
  // Under a trusted conversation, still forward raw phone-like text so the server can
  // fail closed on IDENTITY_PHONE_MISMATCH (Egypt validators may reject foreign formats).
  const phone =
    parsedPhone ||
    (latestIsPhone && hasTrustedBookingIdentity(input.trustedCustomerId) ? latestUserText : null);
  if (!phone) return;

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
  trustedCustomerId?: string | null;
}): Promise<void> {
  if (!customerWantsBookingStatusByReference(input.sourceMessages)) return;
  if (hasSuccessfulSearchBookings(input.toolExecutions)) return;
  const allowed = new Set([
    ...input.allowedToolKeys,
    ...(typeof input.tools.allowedToolKeys === "function" ? input.tools.allowedToolKeys() : []),
  ]);
  if (!allowed.has("search_bookings")) return;
  const phone = readPhoneForBookingSearch(input.sourceMessages);
  const trustedCustomerId = input.trustedCustomerId?.trim() || null;
  if (!phone && !hasTrustedBookingIdentity(trustedCustomerId)) return;
  const routed = await input.tools.route(input.ctx, {
    conversationId: input.conversationId,
    toolKey: "search_bookings",
    input: {
      daysBack: 90,
      purpose: "status",
      ...(phone ? { phone } : {}),
      ...(trustedCustomerId ? { trustedCustomerId } : {}),
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

function applyTicketMutationReplyFallback(
  response: RuntimeGatewayChatResponse,
  toolExecutions: ToolCallLoopResult["toolExecutions"],
): RuntimeGatewayChatResponse {
  const lastMutation = [...toolExecutions]
    .reverse()
    .find(
      (execution) =>
        execution.toolKey === "add_ticket_comment" ||
        execution.toolKey === "change_ticket_status" ||
        execution.toolKey === "change_ticket_priority" ||
        execution.toolKey === "close_ticket",
    );
  if (!lastMutation?.output) return response;
  const facing =
    typeof lastMutation.output.customerFacingMessage === "string"
      ? lastMutation.output.customerFacingMessage.trim()
      : "";
  if (!facing) return response;
  if (response.text.trim().includes(facing) || (lastMutation.output.success === true && response.text.trim().length > 0 && /تم\s*(?:إضافة|تحديث)/u.test(response.text))) {
    return response;
  }
  return {
    ...response,
    text: facing,
    finishReason: response.finishReason ?? "stop",
  };
}

function applyTicketSearchReplyFallback(
  response: RuntimeGatewayChatResponse,
  toolExecutions: ToolCallLoopResult["toolExecutions"],
  messages?: RuntimeGatewayChatRequest["messages"],
): RuntimeGatewayChatResponse {
  // Add-comment / change-status own the reply when they already produced guidance.
  if (
    messages &&
    (customerWantsAddTicketComment(messages) || customerWantsChangeTicketFields(messages))
  ) {
    const mutationGuidance = [...toolExecutions]
      .reverse()
      .find(
        (execution) =>
          (execution.toolKey === "add_ticket_comment" ||
            execution.toolKey === "change_ticket_status" ||
            execution.toolKey === "change_ticket_priority") &&
          typeof execution.output?.customerFacingMessage === "string",
      );
    if (mutationGuidance) return response;
    // Mid comment/change intake: never overwrite with an open-ticket dump unless the user asked to browse.
    if (!customerWantsTicketList(messages)) return response;
  }
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

function hasCreateBookingAttempt(toolExecutions: ToolCallLoopResult["toolExecutions"]): boolean {
  return toolExecutions.some((execution) => execution.toolKey === "create_booking");
}

function isQuestionMarkNudge(text: string): boolean {
  return /^[?؟!\s.،…]+$/u.test(text.trim());
}

/**
 * Question-mark nudges sent while a reply is still in flight must not hide the
 * booking confirmation that arrived just before them and has not been answered.
 */
function latestBookingDecisionText(
  messages: RuntimeGatewayChatRequest["messages"],
): string {
  const latest = latestUserTextFromMessages(messages).trim();
  if (!isQuestionMarkNudge(latest)) return latest;

  let lastUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      lastUserIndex = index;
      break;
    }
  }
  if (lastUserIndex < 0) return latest;

  for (let index = lastUserIndex - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) continue;
    if (message.role === "assistant" || message.role === "tool") return latest;
    if (message.role !== "user") continue;
    const text = String(message.content ?? "").trim();
    if (!text || isQuestionMarkNudge(text)) continue;
    return text;
  }
  return latest;
}

function userAffirmsSingleOfferedSlot(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || isQuestionMarkNudge(trimmed)) return false;
  if (/(?:الغي|ألغي|الغى|إلغاء|cancel)/i.test(trimmed)) return false;
  if (/(?:احجز\s*لي|احجزلي)/iu.test(trimmed)) return true;
  if (
    /^(?:(?:ماشي|تمام|اوك|أوك|اوكي|أوكي|ok|ايوه|أيوه|ايوا|أيوا|نعم|خلاص|طيب)\s+)?(?:احجز|أحجز|احجزه|أحجزه|احجزيه|احجزهولي|احجزيهولي)(?:\s+(?:لي|ليا))?[!.؟?\s]*$/iu.test(
      trimmed,
    )
  ) {
    return true;
  }
  if (/(?:أكد|اكد|أكّد|تأكيد)/u.test(trimmed)) return true;
  if (/(?:اخر|آخر)\s*(?:ميعاد|موعد)/.test(trimmed)) return true;
  if (/(?:الميعاد|الموعد)\s*(?:ده|دا|هذا|اللي)/.test(trimmed)) return true;
  return false;
}

const ARABIC_WEEKDAY_TOKEN_RE =
  /(السبت|الأحد|الاحد|الاثنين|الثلاثاء|الأربعاء|الاربعاء|الخميس|الجمعة)/i;

function singleOfferConflictsWithUserText(
  text: string,
  slot: CanonicalSchedulingSlot,
): boolean {
  const normalized = convertArabicDigitsToAscii(text);
  const weekdayMatch = ARABIC_WEEKDAY_TOKEN_RE.exec(normalized);
  if (weekdayMatch?.[1]) {
    const weekday = arabicWeekdayTokenToJs(weekdayMatch[1]);
    const offerWeekday = cairoJsWeekday(slot.date);
    if (weekday !== null && offerWeekday !== null && weekday !== offerWeekday) return true;
  }
  if (parseArabicClockToSlotStart(normalized)) return false;
  const dayMatch = /(?:^|\s)(\d{1,2})(?:\s|$)/.exec(normalized);
  if (dayMatch?.[1]) {
    const day = Number(dayMatch[1]);
    const offerDay = Number(slot.date.slice(8, 10));
    if (day >= 1 && day <= 31 && offerDay >= 1 && day !== offerDay) return true;
  }
  return false;
}

function weekdayDateOnlyMatchesSingleOffer(
  text: string,
  slot: CanonicalSchedulingSlot,
): boolean {
  const normalized = convertArabicDigitsToAscii(text);
  if (!normalized.trim() || parseArabicClockToSlotStart(normalized)) return false;
  const weekdayMatch = ARABIC_WEEKDAY_TOKEN_RE.exec(normalized);
  if (!weekdayMatch?.[1]) return false;
  const weekday = arabicWeekdayTokenToJs(weekdayMatch[1]);
  if (weekday === null || cairoJsWeekday(slot.date) !== weekday) return false;
  return !singleOfferConflictsWithUserText(text, slot);
}

function latestUserAllowsForcedCreateBooking(
  messages: RuntimeGatewayChatRequest["messages"],
  trustedCustomerId?: string | null,
): boolean {
  if (customerWantsCreateTicket(messages)) return false;
  if (customerWantsCancelBooking(messages) || customerWantsCheckInOrOut(messages)) return false;
  if (customerWantsRescheduleBooking(messages)) return false;
  const latest = latestBookingDecisionText(messages).trim();
  if (!latest || isQuestionMarkNudge(latest) || isNonMutatingFollowUpMessage(latest)) return false;
  if (looksLikeCasualReply(latest) || looksLikeSchedulingInfoQuestion(latest, messages)) return false;
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
  const offeredNow = readMostRecentOfferedSlots(messages);
  const singleOffer = offeredNow.length === 1 ? offeredNow[0]! : null;
  if (userAffirmsSingleOfferedSlot(latest)) {
    if (!singleOffer || !singleOfferConflictsWithUserText(latest, singleOffer)) return true;
  }
  if (singleOffer && weekdayDateOnlyMatchesSingleOffer(latest, singleOffer)) return true;
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

  const visitMenu = missingVisitTypeMenu(input.messages, bookingInput.serviceId);
  if (visitMenu) {
    input.toolExecutions.push({
      toolKey: "create_booking",
      executionId: `forced-booking-visit-type-${Date.now()}`,
      status: "failed",
      output: { success: false, errors: [VISIT_TYPE_REQUIRED], customerFacingMessage: visitMenu },
      durationMs: 0,
    });
    return;
  }

  const branchMenuText = missingBranchMenu(input.messages, bookingInput.serviceId);
  if (branchMenuText) {
    input.toolExecutions.push({
      toolKey: "create_booking",
      executionId: `forced-booking-branch-${Date.now()}`,
      status: "failed",
      output: { success: false, errors: [BRANCH_REQUIRED], customerFacingMessage: branchMenuText },
      durationMs: 0,
    });
    return;
  }

  const routed = await input.tools.route(input.ctx, {
    conversationId: input.conversationId,
    toolKey: "create_booking",
    input: rewriteCreateBookingArgs(bookingInput, input.sourceMessages, input.toolExecutions, input.trustedCustomerId, input.messages),
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
  if (customerWantsAddTicketComment(input.sourceMessages)) return;
  if (customerWantsChangeTicketFields(input.sourceMessages)) return;
  if (hasSuccessfulCreateTicket(input.toolExecutions)) return;
  if (latestUserWantsCreateBooking(input.sourceMessages)) return;
  const latest = latestUserTextFromMessages(input.sourceMessages).trim();
  if (latestIsTicketStatusOrListIntent(latest)) return;
  const allowed = new Set([
    ...input.allowedToolKeys,
    ...(typeof input.tools.allowedToolKeys === "function" ? input.tools.allowedToolKeys() : []),
  ]);
  if (!allowed.has("create_ticket")) return;

  const description = readComplaintDescriptionForCreate(input.sourceMessages);
  if (!description) {
    input.toolExecutions.push({
      toolKey: "create_ticket",
      executionId: `forced-ticket-need-description-${Date.now()}`,
      status: "failed",
      output: {
        success: false,
        errors: [COMPLAINT_DESCRIPTION_REQUIRED],
        customerFacingMessage: ASK_COMPLAINT_DESCRIPTION_REPLY,
      },
      durationMs: 0,
    });
    return;
  }

  const priority = deriveTicketPriorityFromText(description);
  const routed = await input.tools.route(input.ctx, {
    conversationId: input.conversationId,
    toolKey: "create_ticket",
    input: {
      subject: subjectFromComplaintDescription(description),
      description,
      priority,
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

function resolveTicketNumberForMutation(
  sourceMessages: RuntimeGatewayChatRequest["messages"],
  toolExecutions: ToolCallLoopResult["toolExecutions"],
  purpose: "comment" | "change",
): { ticketNumber: string | null; guidance: string | null } {
  if (purpose === "change") {
    const latest = latestUserTextFromMessages(sourceMessages);
    const latestExplicit = readTicketNumberFromLatestUserMessage(sourceMessages);
    if (latestExplicit) return { ticketNumber: latestExplicit, guidance: null };
    if (wantsLastOpenedTicket(latest)) {
      const lastOpen = readLatestOpenTicketNumber(toolExecutions);
      if (lastOpen) return { ticketNumber: lastOpen, guidance: null };
    }
    const pending = readPendingTicketNumberFromAssistant(sourceMessages);
    if (
      pending &&
      (assistantAskedTicketNumberConfirmForChange(sourceMessages) ||
        assistantAskedStatusChangeConfirm(sourceMessages) ||
        assistantAskedForTicketStatusTarget(sourceMessages))
    ) {
      return { ticketNumber: pending, guidance: null };
    }
    // Never dump an open-ticket pick list for status change — ask for the number.
    return { ticketNumber: null, guidance: ASK_TICKET_FOR_STATUS_CHANGE_REPLY };
  }

  // Comment/update: ask for the number — never dump open tickets unless the customer asked to see them.
  const latest = latestUserTextFromMessages(sourceMessages);
  const latestExplicit = readTicketNumberFromLatestUserMessage(sourceMessages);
  if (latestExplicit) return { ticketNumber: latestExplicit, guidance: null };
  if (wantsLastOpenedTicket(latest)) {
    const lastOpen = readLatestOpenTicketNumber(toolExecutions);
    if (lastOpen) return { ticketNumber: lastOpen, guidance: null };
  }
  // After "آخر شكوى" / body ask, the ticket number lives on the assistant turn (toolExecutions reset each turn).
  const pending = readPendingTicketNumberFromAssistant(sourceMessages);
  if (
    pending &&
    (assistantAskedForTicketComment(sourceMessages) ||
      /هضيف\s*(?:ال)?تعليق\s*على/iu.test(lastAssistantText(sourceMessages)))
  ) {
    return { ticketNumber: pending, guidance: null };
  }
  // Body turn after last-ticket: re-use latest open from a search forced this turn.
  if (
    assistantAskedForTicketComment(sourceMessages) &&
    isUsableTicketCommentBodyText(latest)
  ) {
    const lastOpen = readLatestOpenTicketNumber(toolExecutions);
    if (lastOpen) return { ticketNumber: lastOpen, guidance: null };
  }
  if (customerWantsTicketList(sourceMessages)) {
    const listed = readListedTicketSummaries(toolExecutions, { includeClosed: true }).slice(
      0,
      TICKET_LIST_BROWSE_LIMIT,
    );
    if (listed.length === 1) {
      return { ticketNumber: listed[0]!.ticketNumber, guidance: null };
    }
    if (listed.length > 1) {
      return { ticketNumber: null, guidance: formatTicketPickList(listed, purpose) };
    }
  }
  return {
    ticketNumber: null,
    guidance: ASK_TICKET_FOR_COMMENT_REPLY,
  };
}

async function forceAddTicketCommentIfReady(input: {
  tools: RuntimeToolPort;
  ctx: ServiceContext;
  conversationId: string;
  allowedToolKeys: string[];
  sourceMessages: RuntimeGatewayChatRequest["messages"];
  toolExecutions: ToolCallLoopResult["toolExecutions"];
}): Promise<void> {
  const continuing = assistantAskedForTicketComment(input.sourceMessages);
  if (!customerWantsAddTicketComment(input.sourceMessages) && !continuing) return;
  if (hasSuccessfulAddTicketComment(input.toolExecutions)) return;
  if (customerWantsCreateTicket(input.sourceMessages) && !continuing) return;
  const allowed = new Set([
    ...input.allowedToolKeys,
    ...(typeof input.tools.allowedToolKeys === "function" ? input.tools.allowedToolKeys() : []),
  ]);
  if (!allowed.has("add_ticket_comment")) return;

  const resolved = resolveTicketNumberForMutation(
    input.sourceMessages,
    input.toolExecutions,
    "comment",
  );
  const latest = latestUserTextFromMessages(input.sourceMessages);
  const earlyBody =
    !resolved.ticketNumber &&
    (assistantAskedForCommentTicketNumber(input.sourceMessages) ||
      assistantAskedForTicketComment(input.sourceMessages)) &&
    isUsableTicketCommentBodyText(latest)
      ? latest
      : null;

  if (!resolved.ticketNumber) {
    const askNumber = earlyBody
      ? ASK_TICKET_COMMENT_GOT_BODY_ASK_NUMBER_REPLY
      : (resolved.guidance ?? ASK_TICKET_FOR_COMMENT_REPLY);
    input.toolExecutions.push({
      toolKey: "add_ticket_comment",
      executionId: `forced-ticket-comment-pick-${Date.now()}`,
      status: "failed",
      output: {
        success: false,
        errors: [TICKET_PICK_REQUIRED],
        customerFacingMessage: askNumber,
      },
      durationMs: 0,
    });
    return;
  }

  const body = readTicketCommentBodyFromMessages(input.sourceMessages);
  if (!body) {
    const confirmAsk =
      wantsLastOpenedTicket(latest) && !readTicketNumberFromLatestUserMessage(input.sourceMessages)
        ? `تمام، هضيف التعليق على ${resolved.ticketNumber}. ${ASK_TICKET_COMMENT_BODY_REPLY}`
        : ASK_TICKET_COMMENT_BODY_REPLY;
    input.toolExecutions.push({
      toolKey: "add_ticket_comment",
      executionId: `forced-ticket-comment-body-${Date.now()}`,
      status: "failed",
      output: {
        success: false,
        errors: [TICKET_COMMENT_BODY_REQUIRED],
        customerFacingMessage: confirmAsk,
      },
      durationMs: 0,
    });
    return;
  }

  const routed = await input.tools.route(input.ctx, {
    conversationId: input.conversationId,
    toolKey: "add_ticket_comment",
    input: {
      ticketId: resolved.ticketNumber,
      body,
      isInternal: false,
    },
    triggeredBy: "agent",
  });
  input.toolExecutions.push({
    toolKey: routed.toolKey,
    executionId: routed.executionId,
    status: routed.status,
    output: {
      ...(routed.output && typeof routed.output === "object" ? routed.output : {}),
      ticketNumber: resolved.ticketNumber,
      customerFacingMessage:
        routed.status === "succeeded" && routed.output?.success === true
          ? `تم إضافة تعليق جديد على تذكرة رقم ${resolved.ticketNumber}.`
          : typeof routed.output?.customerFacingMessage === "string"
            ? routed.output.customerFacingMessage
            : undefined,
    },
    durationMs: routed.durationMs,
  });
}

async function forceChangeTicketFieldsIfReady(input: {
  tools: RuntimeToolPort;
  ctx: ServiceContext;
  conversationId: string;
  allowedToolKeys: string[];
  sourceMessages: RuntimeGatewayChatRequest["messages"];
  toolExecutions: ToolCallLoopResult["toolExecutions"];
}): Promise<void> {
  const continuing =
    assistantAskedForTicketStatusTarget(input.sourceMessages) ||
    assistantAskedTicketNumberConfirmForChange(input.sourceMessages) ||
    assistantAskedStatusChangeConfirm(input.sourceMessages) ||
    assistantAskedClarifyTicketNumber(input.sourceMessages);
  if (!customerWantsChangeTicketFields(input.sourceMessages) && !continuing) return;
  if (hasSuccessfulChangeTicketField(input.toolExecutions)) return;
  const allowed = new Set([
    ...input.allowedToolKeys,
    ...(typeof input.tools.allowedToolKeys === "function" ? input.tools.allowedToolKeys() : []),
  ]);
  const latest = latestUserTextFromMessages(input.sourceMessages);

  const pushGuidance = (errors: string[], customerFacingMessage: string, executionId: string) => {
    input.toolExecutions.push({
      toolKey: "change_ticket_status",
      executionId,
      status: "failed",
      output: {
        success: false,
        errors,
        customerFacingMessage,
      },
      durationMs: 0,
    });
  };

  const mutateStatus = async (
    ticketNumber: string,
    status: "open" | "in_progress" | "waiting_customer" | "resolved" | "closed",
  ) => {
    const toolKey =
      status === "closed" || status === "resolved"
        ? allowed.has("close_ticket")
          ? "close_ticket"
          : allowed.has("change_ticket_status")
            ? "change_ticket_status"
            : null
        : allowed.has("change_ticket_status")
          ? "change_ticket_status"
          : null;
    if (!toolKey) return;
    const routed = await input.tools.route(input.ctx, {
      conversationId: input.conversationId,
      toolKey,
      input: { ticketId: ticketNumber, status },
      triggeredBy: "agent",
    });
    input.toolExecutions.push({
      toolKey: routed.toolKey,
      executionId: routed.executionId,
      status: routed.status,
      output: {
        ...(routed.output && typeof routed.output === "object" ? routed.output : {}),
        ticketNumber,
        customerFacingMessage:
          routed.status === "succeeded" && routed.output?.success === true
            ? ticketStatusChangedSuccessMessage(ticketNumber, ticketStatusLabel(status))
            : typeof routed.output?.customerFacingMessage === "string"
              ? routed.output.customerFacingMessage
              : undefined,
      },
      durationMs: routed.durationMs,
    });
  };

  const mutatePriority = async (
    ticketNumber: string,
    priority: "low" | "normal" | "high" | "urgent",
  ) => {
    if (!allowed.has("change_ticket_priority")) {
      pushGuidance(
        [TICKET_STATUS_TARGET_REQUIRED],
        "مش قادر أغيّر أولوية الشكوى دلوقتي. جرّب تاني أو كلّم الدعم.",
        `forced-ticket-change-priority-denied-${Date.now()}`,
      );
      return;
    }
    const routed = await input.tools.route(input.ctx, {
      conversationId: input.conversationId,
      toolKey: "change_ticket_priority",
      input: { ticketId: ticketNumber, priority },
      triggeredBy: "agent",
    });
    input.toolExecutions.push({
      toolKey: routed.toolKey,
      executionId: routed.executionId,
      status: routed.status,
      output: {
        ...(routed.output && typeof routed.output === "object" ? routed.output : {}),
        ticketNumber,
        customerFacingMessage:
          routed.status === "succeeded" && routed.output?.success === true
            ? ticketStatusChangedSuccessMessage(ticketNumber, ticketPriorityLabel(priority))
            : typeof routed.output?.customerFacingMessage === "string"
              ? routed.output.customerFacingMessage
              : undefined,
      },
      durationMs: routed.durationMs,
    });
  };

  const labelForChoice = (
    choice:
      | { kind: "priority"; value: "low" | "normal" | "high" | "urgent" }
      | { kind: "status"; value: "open" | "in_progress" | "waiting_customer" | "resolved" | "closed" },
  ): string =>
    choice.kind === "priority" ? ticketPriorityLabel(choice.value) : ticketStatusLabel(choice.value);

  // Step: confirm the chosen priority/status before mutating.
  if (assistantAskedStatusChangeConfirm(input.sourceMessages)) {
    const pending = readPendingFieldChangeFromAssistant(input.sourceMessages);
    if (!pending) {
      const ticketNumber = readPendingTicketNumberFromAssistant(input.sourceMessages);
      pushGuidance(
        [TICKET_STATUS_TARGET_REQUIRED],
        ticketNumber ? askTicketNewStatusForTicket(ticketNumber) : ASK_TICKET_NEW_STATUS_REPLY,
        `forced-ticket-change-status-reask-${Date.now()}`,
      );
      return;
    }
    if (isNegativeReply(latest)) {
      pushGuidance(
        [TICKET_STATUS_TARGET_REQUIRED],
        askTicketNewStatusForTicket(pending.ticketNumber),
        `forced-ticket-change-status-reject-${Date.now()}`,
      );
      return;
    }
    if (isAffirmativeReply(latest)) {
      if (pending.kind === "priority") {
        await mutatePriority(pending.ticketNumber, pending.value);
      } else {
        await mutateStatus(pending.ticketNumber, pending.value);
      }
      return;
    }
    const choice = parseStatusChoiceFromText(latest);
    if (choice) {
      pushGuidance(
        [TICKET_STATUS_CONFIRM_REQUIRED],
        askConfirmStatusChange(pending.ticketNumber, labelForChoice(choice)),
        `forced-ticket-change-status-reconfirm-${Date.now()}`,
      );
      return;
    }
    pushGuidance(
      [TICKET_STATUS_CONFIRM_REQUIRED],
      askConfirmStatusChange(
        pending.ticketNumber,
        pending.kind === "priority"
          ? ticketPriorityLabel(pending.value)
          : ticketStatusLabel(pending.value),
      ),
      `forced-ticket-change-status-confirm-again-${Date.now()}`,
    );
    return;
  }

  // Step: confirm the ticket number (yes / no / new number / last ticket).
  if (assistantAskedTicketNumberConfirmForChange(input.sourceMessages)) {
    const pendingNumber =
      readPendingTicketNumberFromAssistant(input.sourceMessages) ??
      readTicketNumberFromMessages(input.sourceMessages);
    if (isNegativeReply(latest)) {
      pushGuidance(
        [TICKET_PICK_REQUIRED],
        ASK_TICKET_CLARIFY_NUMBER_REPLY,
        `forced-ticket-change-number-reject-${Date.now()}`,
      );
      return;
    }
    const explicitNow = readTicketNumberFromMessages(input.sourceMessages);
    const latestIsBareNumber = /^TKT-\d+$/i.test(latest) || /^\d{5,8}$/.test(latest);
    if (explicitNow && latestIsBareNumber && explicitNow !== pendingNumber) {
      pushGuidance(
        [TICKET_NUMBER_CONFIRM_REQUIRED],
        askConfirmTicketNumberForStatusChange(explicitNow),
        `forced-ticket-change-number-switch-${Date.now()}`,
      );
      return;
    }
    if (wantsLastOpenedTicket(latest)) {
      const lastOpen = readLatestOpenTicketNumber(input.toolExecutions);
      if (!lastOpen) {
        pushGuidance(
          [TICKET_PICK_REQUIRED],
          ASK_TICKET_CLARIFY_NUMBER_REPLY,
          `forced-ticket-change-last-missing-${Date.now()}`,
        );
        return;
      }
      pushGuidance(
        [TICKET_NUMBER_CONFIRM_REQUIRED],
        askConfirmTicketNumberForStatusChange(lastOpen),
        `forced-ticket-change-last-confirm-${Date.now()}`,
      );
      return;
    }
    if (isAffirmativeReply(latest) || (explicitNow && latestIsBareNumber && explicitNow === pendingNumber)) {
      const ticketNumber = pendingNumber ?? explicitNow;
      if (!ticketNumber) {
        pushGuidance(
          [TICKET_PICK_REQUIRED],
          ASK_TICKET_CLARIFY_NUMBER_REPLY,
          `forced-ticket-change-number-missing-${Date.now()}`,
        );
        return;
      }
      pushGuidance(
        [TICKET_STATUS_TARGET_REQUIRED],
        askTicketNewStatusForTicket(ticketNumber),
        `forced-ticket-change-ask-status-${Date.now()}`,
      );
      return;
    }
    if (explicitNow && !isAffirmativeReply(latest) && !isNegativeReply(latest)) {
      pushGuidance(
        [TICKET_NUMBER_CONFIRM_REQUIRED],
        askConfirmTicketNumberForStatusChange(explicitNow),
        `forced-ticket-change-number-new-${Date.now()}`,
      );
      return;
    }
    pushGuidance(
      [TICKET_NUMBER_CONFIRM_REQUIRED],
      pendingNumber
        ? askConfirmTicketNumberForStatusChange(pendingNumber)
        : ASK_TICKET_CLARIFY_NUMBER_REPLY,
      `forced-ticket-change-number-again-${Date.now()}`,
    );
    return;
  }

  // Step: customer picked a priority (or explicit workflow status) — confirm before mutate.
  if (assistantAskedForTicketStatusTarget(input.sourceMessages)) {
    const ticketNumber =
      readPendingTicketNumberFromAssistant(input.sourceMessages) ??
      readTicketNumberFromLatestUserMessage(input.sourceMessages) ??
      readLatestOpenTicketNumber(input.toolExecutions);
    if (!ticketNumber) {
      pushGuidance(
        [TICKET_PICK_REQUIRED],
        ASK_TICKET_FOR_STATUS_CHANGE_REPLY,
        `forced-ticket-change-status-no-ticket-${Date.now()}`,
      );
      return;
    }
    const choice = parseStatusChoiceFromText(latest);
    if (!choice) {
      pushGuidance(
        [TICKET_STATUS_TARGET_REQUIRED],
        askTicketNewStatusForTicket(ticketNumber),
        `forced-ticket-change-status-invalid-${Date.now()}`,
      );
      return;
    }
    pushGuidance(
      [TICKET_STATUS_CONFIRM_REQUIRED],
      askConfirmStatusChange(ticketNumber, labelForChoice(choice)),
      `forced-ticket-change-status-confirm-${Date.now()}`,
    );
    return;
  }

  // Step: resolve which ticket, then confirm the number (never mutate yet).
  const resolved = resolveTicketNumberForMutation(
    input.sourceMessages,
    input.toolExecutions,
    "change",
  );
  if (!resolved.ticketNumber) {
    if (wantsLastOpenedTicket(latest) && !readLatestOpenTicketNumber(input.toolExecutions)) {
      pushGuidance(
        [TICKET_PICK_REQUIRED],
        "مفيش شكوى مفتوحة دلوقتي على حسابك. ابعت رقم الشكوى لو عندك.",
        `forced-ticket-change-no-open-${Date.now()}`,
      );
      return;
    }
    pushGuidance(
      [TICKET_PICK_REQUIRED],
      resolved.guidance ?? ASK_TICKET_FOR_STATUS_CHANGE_REPLY,
      `forced-ticket-change-pick-${Date.now()}`,
    );
    return;
  }

  pushGuidance(
    [TICKET_NUMBER_CONFIRM_REQUIRED],
    askConfirmTicketNumberForStatusChange(resolved.ticketNumber),
    `forced-ticket-change-confirm-number-${Date.now()}`,
  );
}

function formatCustomerBookingDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!match) return date.trim();
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function formatCustomerBookingTime(slotStart: string): string {
  return formatArabicTime12h(slotStart);
}

function slotsSharingBareHour(
  text: string,
  offered: CanonicalSchedulingSlot[],
): CanonicalSchedulingSlot[] {
  const parsed = parseArabicTimeOnlySelection(text);
  if (!parsed) return [];
  const ascii = convertArabicDigitsToAscii(text);
  if (/\d{1,2}:\d{2}/.test(ascii)) return [];
  const parts = slotStartHour12Parts(parsed.slotStart);
  if (!parts) return [];
  return offered.filter((slot) => {
    const offeredParts = slotStartHour12Parts(slot.slotStart);
    if (!offeredParts || offeredParts.hour12 !== parts.hour12) return false;
    if (!parsed.hasExplicitPeriod) return true;
    const offeredHour = Number(slot.slotStart.slice(0, 2));
    const wantedHour = Number(parsed.slotStart.slice(0, 2));
    return offeredHour >= 12 === wantedHour >= 12;
  });
}

function ambiguousHourClarification(
  messages: RuntimeGatewayChatRequest["messages"],
  toolExecutions: ToolCallLoopResult["toolExecutions"],
): string | null {
  if (resolveCanonicalSelectedSlot(messages, toolExecutions)) return null;
  const offered = readMostRecentOfferedSlotsContext(messages, toolExecutions).slots;
  if (offered.length < 2) return null;
  const latest = latestUserTextFromMessages(messages);
  let hourText = "";
  if (slotsSharingBareHour(latest, offered).length > 1) hourText = latest;
  else if (userAffirmsSingleOfferedSlot(latest)) {
    const users = messages
      .filter((message) => message.role === "user")
      .map((message) => String(message.content ?? ""));
    for (const text of [...users].reverse()) {
      if (text.trim() === latest.trim()) continue;
      if (slotsSharingBareHour(text, offered).length > 1) {
        hourText = text;
        break;
      }
    }
  }
  const matches = hourText ? slotsSharingBareHour(hourText, offered) : [];
  if (matches.length < 2) return null;
  const lines = [...new Set(matches.map((slot) => formatArabicTime12h(slot.slotStart)))];
  return `الساعة دي فيها أكتر من ميعاد. اختار واحد بالظبط:\n${lines.map((line) => `- ${line}`).join("\n")}`;
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
  if (customerWantsRescheduleBooking(messages)) return response;
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

type CustomerReplyLanguage = "ar" | "en" | "de";

/** Last clear customer language. A name, SKU, or short ack does not switch the conversation. */
function customerReplyLanguage(
  messages: RuntimeGatewayChatRequest["messages"],
): CustomerReplyLanguage {
  const latestUser = [...messages].reverse().find((message) => message.role === "user");
  const latestSignal = languageSignal(String(latestUser?.content ?? ""));
  if (latestSignal) return latestSignal;
  const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  const assistantSignal = languageSignal(String(latestAssistant?.content ?? ""));
  if (assistantSignal) return assistantSignal;
  const users = messages.filter((message) => message.role === "user");
  for (const message of [...users].reverse()) {
    const signal = languageSignal(String(message.content ?? ""));
    if (signal) return signal;
  }
  return "ar";
}

function languageSignal(value: string): CustomerReplyLanguage | null {
  return detectCustomerLanguage(value);
}

function askWhichService(language: CustomerReplyLanguage): string {
  if (language === "en") return "Which service should I check open times for?";
  if (language === "de") return "Für welche Leistung soll ich die freien Termine prüfen?";
  return "قوليلي اسم الخدمة عشان أجيب الأيام المتاحة.";
}

function askNearestService(language: CustomerReplyLanguage): string {
  if (language === "en") return "Which service should I check the next open time for?";
  if (language === "de") return "Für welche Leistung soll ich den nächsten freien Termin prüfen?";
  return "قوليلي الخدمة (مثل عيادة) عشان أجيب أقرب موعد متاح.";
}

function nearestLookupFailed(language: CustomerReplyLanguage, resend = false): string {
  if (language === "en") return "I couldn't load the next open time. Please try again in a moment.";
  if (language === "de") return "Der nächste freie Termin konnte nicht geladen werden. Bitte versuchen Sie es gleich noch einmal.";
  return resend
    ? "ما قدرناش نجيب أقرب موعد دلوقتي. ابعت الطلب تاني."
    : "ما قدرناش نجيب أقرب موعد دلوقتي. جرّبي تاني بعد لحظات.";
}

function availabilityLookupFailed(language: CustomerReplyLanguage): string {
  if (language === "en") return "I couldn't load the open times. Please send the request again.";
  if (language === "de") return "Die freien Termine konnten nicht geladen werden. Bitte senden Sie die Anfrage erneut.";
  return "ما قدرناش نجيب المواعيد دلوقتي. ابعت الطلب تاني.";
}

/** A question for bookable times. A bare "open" or "available", or a name with "?", is not one. */
function looksLikeAvailabilityTimeQuestion(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  // "إيه أقرب موعد" is one nearest slot (find_next_available), not a day list.
  if (customerWantsFindNextAvailableFromText(trimmed) && !/مواعيد/u.test(trimmed)) return false;
  if (/\b(?:role|job|position|hiring|headphone|product|front desk)\b/i.test(trimmed)) return false;
  if (/(?:what|which)\s+times?\b/i.test(trimmed)) return true;
  if (/\btimes?\b.{0,40}\b(?:open|available)\b/i.test(trimmed)) return true;
  if (/\b(?:am|pm)\b.{0,24}\bavailable\b|\bavailable\b.{0,24}\b(?:am|pm|tomorrow)\b/i.test(trimmed)) {
    return /\b(?:am|pm|\d|tomorrow|times)\b/i.test(trimmed);
  }
  if (/\b(?:welche|welcher)\b.{0,32}\btermine\b/i.test(trimmed)) return true;
  if (/\btermin\b.{0,32}\bfrei\b/i.test(trimmed)) return true;
  return /(?:ايه|إيه|اى|في|فيه|فى).{0,28}(?:مواعيد|معاد|ميعاد|موعد|أوقات|اوقات)|(?:المواعيد|مواعيد|الأوقات|الاوقات|أوقات|اوقات).{0,24}(?:متاح|بكر)|(?:معاد|ميعاد).{0,20}(?:الساعة|بكر)/u.test(
    trimmed,
  );
}

/** "دكتور Adam" names the provider of this turn's slot list ("المواعيد المتاحة مع ADAM"); it is not the customer's own name. */
function latestNamesAvailabilityProvider(
  latest: string,
  currentTurnExecutions: ToolCallLoopResult["toolExecutions"],
): boolean {
  const summary = readSearchAvailabilitySummary(lastUsableAvailability(currentTurnExecutions)?.output ?? null);
  const header = (summary ?? "").split("\n")[0] ?? "";
  const provider = /\sمع\s+(.+?)\s*[:：]?\s*$/u.exec(header)?.[1];
  if (!provider) return false;
  const providerTokens = new Set(normalizeSchedulingCatalogLabel(provider).split(" ").filter(Boolean));
  return normalizeSchedulingCatalogLabel(stripTrailingChatPunctuation(latest))
    .split(" ")
    .some((token) => token.length >= 3 && providerTokens.has(token));
}

function localizedSlotSummary(
  output: Record<string, unknown> | null,
  language: CustomerReplyLanguage,
): string | null {
  if (language === "ar") return readSearchAvailabilitySummary(output);
  const slots = collectAvailabilitySlots(output);
  if (slots.length === 0) return null;
  const resource = slots.find((slot) => slot.resourceName)?.resourceName || "";
  const dates = [...new Set(slots.map((slot) => slot.date))].sort();
  const lines = dates.map((date) => {
    const times = [...new Set(slots.filter((slot) => slot.date === date).map((slot) => slot.start))];
    return `- ${date}: ${times.join(", ")}`;
  });
  const header =
    language === "de"
      ? `Freie Termine${resource ? ` bei ${resource}` : ""}:`
      : `Open times${resource ? ` with ${resource}` : ""}:`;
  return `${header}\n${lines.join("\n")}`;
}

function applySearchAvailabilityReplyFallback(
  response: RuntimeGatewayChatResponse,
  toolExecutions: ToolCallLoopResult["toolExecutions"],
  messages: RuntimeGatewayChatRequest["messages"] = [],
  currentTurnExecutions: ToolCallLoopResult["toolExecutions"] = toolExecutions,
): RuntimeGatewayChatResponse {
  // Booking outcome wins. Never re-send slot lists after create_booking ran in this turn.
  if (hasCreateBookingAttempt(toolExecutions)) return response;
  if (customerWantsCreateTicket(messages) || customerWantsAnyTicketFlow(messages)) return response;
  if (customerWantsRescheduleBooking(messages)) return response;
  const latest = latestUserTextFromMessages(messages).trim();
  if (
    looksLikeCasualReply(latest) ||
    looksLikeSchedulingInfoQuestion(latest, messages) ||
    isNonMutatingFollowUpMessage(latest)
  ) {
    return response;
  }
  if (
    isCompleteCustomerFullName(latest) &&
    !looksLikeAvailabilityTimeQuestion(latest) &&
    !latestUserMessageHasBookingSlot(latest) &&
    !latestUserWantsCreateBooking(messages) &&
    !latestNamesAvailabilityProvider(latest, currentTurnExecutions)
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

  const text = response.text.trim();
  const askedForTimes =
    looksLikeAvailabilityTimeQuestion(latest) || customerWantsOtherSlots(latest);
  // A real answer to a name or an ordinary sentence stays. Slot text fills an availability
  // question, or an empty/placeholder reply after search_availability actually ran.
  if (
    text &&
    !askedForTimes &&
    !isAvailabilityPlaceholderReply(text) &&
    !isBookingPlaceholderReply(text)
  ) {
    return response;
  }
  // A slot list from an earlier turn only fills an empty/placeholder reply; it must never
  // overwrite a real answer to an unrelated question (e.g. "what can you help me with?").
  const lastAvailability =
    lastUsableAvailability(currentTurnExecutions) ??
    (!text || isAvailabilityPlaceholderReply(text) ? lastUsableAvailability(toolExecutions) : undefined);
  const languageForSummary = customerReplyLanguage(messages);
  const summary =
    localizedSlotSummary(lastAvailability?.output ?? null, languageForSummary) ??
    readSearchAvailabilitySummary(lastAvailability?.output ?? null);
  if (!summary) return response;

  const summaryHasPeriod = /صباح|مساء|ظهر/u.test(summary);
  const textHasPeriod = /صباح|مساء|ظهر/u.test(text);
  if (text && responseIncludesAvailabilityDetails(text, summary) && (!summaryHasPeriod || textHasPeriod)) {
    return response;
  }
  if (isFalseBookingConfirmation(text)) return response;

  const language = languageForSummary;
  const closing =
    language === "en"
      ? "Choose a time and I will continue the booking."
      : language === "de"
        ? "Wählen Sie eine Uhrzeit, dann setze ich die Buchung fort."
        : "اختاري الموعد المناسب لكِ وسأكمل الحجز.";
  return {
    ...response,
    text: `${summary}\n\n${closing}`,
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
  /** Test clock for support-hours checks. Production omits this and uses the current time. */
  now?: Date;
  /**
   * Official floating assistant only. When set, catalog and sales shortcuts do not
   * answer before the model. The model chooses tools under the normal auto policy.
   * Other channels keep the deterministic turns their tests require.
   */
  deferDeterministicSales?: boolean;
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

function stoppedLoopResult(
  input: ToolCallLoopInput,
  text: string,
  toolExecutions: ToolCallLoopResult["toolExecutions"] = [],
): ToolCallLoopResult {
  return {
    response: {
      text,
      model: input.gatewayRequest.model ?? "unknown",
      providerKey: input.gatewayRequest.providerKey ?? "unknown",
      finishReason: "stop",
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      latencyMs: 0,
    },
    messages: [...input.gatewayRequest.messages],
    toolExecutions,
  };
}

/**
 * A request to reach customer service never becomes a booking slot.
 * Transfer runs only when escalate_to_human is enabled and support hours are open.
 */
async function replyToHumanRequest(
  input: ToolCallLoopInput,
  tools: RuntimeToolPort | undefined,
): Promise<ToolCallLoopResult | null> {
  const latest = latestUserTextFromMessages(input.gatewayRequest.messages);
  if (!customerContinuesHumanWait(latest, input.gatewayRequest.messages)) return null;
  // Complaint filing that mentions مدير/manager still opens a ticket (high priority) — not handoff.
  if (
    customerWantsCreateTicket(input.gatewayRequest.messages) ||
    customerContinuingComplaintIntake(input.gatewayRequest.messages)
  ) {
    return null;
  }
  const blob = companyFactsBlob(input.gatewayRequest.messages);
  const offered = new Set([
    ...input.allowedToolKeys,
    ...(tools && typeof tools.allowedToolKeys === "function" ? tools.allowedToolKeys() : []),
  ]);
  const handoffEnabled = offered.has("escalate_to_human");
  const open = supportHoursAreOpen(blob, input.now ?? new Date());
  if (!open) {
    return stoppedLoopResult(input, humanSupportClosedReply(input.gatewayRequest.messages));
  }
  if (!handoffEnabled || !tools) {
    return stoppedLoopResult(input, "مفيش تحويل لموظف متاح دلوقتي.");
  }
  try {
    const routed = await tools.route(input.ctx, {
      conversationId: input.conversationId,
      toolKey: "escalate_to_human",
      input: {
        reason: latest,
        triggerCode: "customer_requested",
      },
      triggeredBy: "agent",
    });
    const output = routed.output ?? {};
    if (routed.status === "failed" || output.success === false) {
      const language = customerReplyLanguage(input.gatewayRequest.messages);
      const text =
        language === "en"
          ? "I could not transfer you to a teammate, and the request was not registered."
          : language === "de"
            ? "Ich konnte Sie nicht an einen Mitarbeiter übergeben, und die Anfrage wurde nicht registriert."
            : "محوّلتش الطلب لموظف، ومتسجلش.";
      return stoppedLoopResult(input, text, [
        {
          toolKey: routed.toolKey,
          executionId: routed.executionId,
          status: routed.status,
          output: routed.output,
          durationMs: routed.durationMs,
        },
      ]);
    }
    const ownerType =
      output.ownership && typeof output.ownership === "object"
        ? (output.ownership as { ownerType?: unknown }).ownerType
        : null;
    const assigned = output.assigned === true || ownerType === "human_agent";
    const departmentName =
      typeof output.departmentName === "string" && output.departmentName.trim()
        ? output.departmentName.trim()
        : "";
    const waitText =
      departmentName === "المدير"
        ? "برجاء الانتظار جاري تحويلك للمدير"
        : departmentName
          ? `برجاء الانتظار جاري تحويلك لموظف ${departmentName}`
          : HUMAN_TRANSFER_WAIT;
    const busyText =
      departmentName && departmentName !== "خدمة العملاء" && departmentName !== "المدير"
        ? `موظفي ${departmentName} مشغولين بالرد علي عملاء اخرين برجاء الانتظار و سيقوم احد موظفينا بالرد عليكم في اقرب وقت`
        : HUMAN_BUSY_WAIT;
    const alreadyWaiting = input.gatewayRequest.messages.some(
      (message) =>
        message.role === "assistant" &&
        /تم تسجيل طلبك|قائمة الانتظار|جاري تحويلك/u.test(String(message.content ?? "")),
    );
    let text: string;
    if (output.departmentMissing === true) {
      text = departmentName
        ? `قسم ${departmentName} مش متسجل.`
        : "القسم ده مش متسجل.";
    } else if (assigned) {
      text = waitText;
    } else if (alreadyWaiting || output.idempotent === true) {
      text = HUMAN_WAIT_FOLLOW_UP;
    } else {
      text = busyText;
    }
    return stoppedLoopResult(input, text, [
      {
        toolKey: routed.toolKey,
        executionId: routed.executionId,
        status: routed.status,
        output: routed.output,
        durationMs: routed.durationMs,
      },
    ]);
  } catch {
    const language = customerReplyLanguage(input.gatewayRequest.messages);
    const text =
      language === "en"
        ? "I could not transfer you to a teammate, and the request was not registered."
        : language === "de"
          ? "Ich konnte Sie nicht an einen Mitarbeiter übergeben, und die Anfrage wurde nicht registriert."
          : "محوّلتش الطلب لموظف، ومتسجلش.";
    return stoppedLoopResult(input, text);
  }
}

const TICKET_MENTION = /(?:شكو|شكاو|تذكر[ةه]|complaint|ticket|TKT-)/iu;
const COMPLAINTS_UNAVAILABLE = "للأسف تسجيل الشكاوى مش متاح عندي هنا.";

/** Without ticket tools the model must not promise to file or track a complaint. */
function unsupportedComplaintReply(
  input: ToolCallLoopInput,
  tools: RuntimeToolPort | undefined,
): string | null {
  const latest = latestUserTextFromMessages(input.gatewayRequest.messages);
  if (!TICKET_MENTION.test(latest)) return null;
  const offered = offeredToolKeys(input, tools);
  if ([...TICKET_TOOL_KEYS].some((key) => offered.has(key))) return null;
  return offered.has("escalate_to_human")
    ? `${COMPLAINTS_UNAVAILABLE} لو تحب تكلم حد من خدمة العملاء قولّي "عايز أكلم خدمة العملاء".`
    : COMPLAINTS_UNAVAILABLE;
}

function offeredToolKeys(input: ToolCallLoopInput, tools: RuntimeToolPort | undefined): Set<string> {
  return new Set([
    ...input.allowedToolKeys,
    ...(tools && typeof tools.allowedToolKeys === "function" ? tools.allowedToolKeys() : []),
  ]);
}

const CAPABILITY_LIST_LINE = /^\s*(?:[-•*▪]|\d+[.)-])\s*/u;

/** "What can you do" lists must not advertise complaints when ticket tools are disabled. */
function stripUnofferedComplaintCapability(
  response: RuntimeGatewayChatResponse,
  input: ToolCallLoopInput,
  tools: RuntimeToolPort | undefined,
): RuntimeGatewayChatResponse {
  if (!response.text || !TICKET_MENTION.test(response.text)) return response;
  const offered = offeredToolKeys(input, tools);
  if ([...TICKET_TOOL_KEYS].some((key) => offered.has(key))) return response;
  const lines = response.text.split("\n");
  const kept = lines.filter((line) => !(CAPABILITY_LIST_LINE.test(line) && TICKET_MENTION.test(line)));
  if (kept.length === lines.length || !kept.some((line) => CAPABILITY_LIST_LINE.test(line))) {
    return response;
  }
  return { ...response, text: kept.join("\n") };
}

const HELP_QUESTION =
  /^(?:(?:طب|طيب|قولي|قولّي|هو|انت|إنت|ممكن)\s+)*(?:(?:تقدر|بتقدر|ممكن|تعرف)\s+)?[تب]?ساعدني\s+(?:(?:في|ف)\s+)?(?:ايه|إيه|اية|اي|ايش|ازاي|إزاي|اذاي|ازاى)$|^(?:(?:انت|إنت)\s+)?بتعمل\s+(?:ايه|إيه)$|^(?:ايه|إيه)\s+(?:هي\s+)?(?:خدماتك|الخدمات)$|^خدماتك\s+(?:ايه|إيه)$|^(?:how can you help(?: me)?|what can you do)$/iu;

function isHelpQuestion(text: string): boolean {
  return HELP_QUESTION.test(text.replace(/[?؟!.,،…]+/gu, " ").replace(/\s+/gu, " ").trim());
}

function isPunctuationOnly(text: string): boolean {
  return /^[\s?؟!.…]+$/u.test(text);
}

/** Customer messages that arrived after the assistant's last reply, oldest first. */
function unansweredUserTexts(messages: RuntimeGatewayChatRequest["messages"]): string[] {
  const texts: string[] = [];
  for (const message of [...messages].reverse()) {
    if (message.role === "assistant") break;
    if (message.role === "user") texts.unshift(String(message.content ?? "").trim());
  }
  return texts;
}

/** "What can you help me with" is answered from the enabled tools, never by looking up bookings. */
function capabilitiesReply(input: ToolCallLoopInput, tools: RuntimeToolPort | undefined): string | null {
  const unanswered = unansweredUserTexts(input.gatewayRequest.messages);
  if (!unanswered.some(isHelpQuestion)) return null;
  if (!unanswered.every((text) => isHelpQuestion(text) || isPunctuationOnly(text))) return null;
  const offered = offeredToolKeys(input, tools);
  const abilities = [
    offered.has("create_booking") ? "حجز موعد جديد" : null,
    offered.has("search_bookings") ? "معرفة حجوزاتك الجاية أو اللي فاتت" : null,
    offered.has("reschedule_booking") ? "تغيير ميعاد حجز" : null,
    offered.has("cancel_booking") ? "إلغاء موعد" : null,
    [...TICKET_TOOL_KEYS].some((key) => offered.has(key)) ? "تسجيل شكوى أو طلب" : null,
    offered.has("search_products") ? "معرفة المنتجات بالاسم أو الرمز" : null,
    offered.has("escalate_to_human") ? "التواصل مع خدمة العملاء" : null,
  ].filter((line): line is string => Boolean(line));
  if (abilities.length === 0) return null;
  return ["أقدر أساعدك في:", ...abilities.map((line) => `- ${line}`), "قولّي محتاج إيه؟"].join("\n");
}

const POLICY_QUESTION =
  /(?:سياسه|سياسة).{0,40}(?:الشركه|الشركة|شركتكم)|(?:الشركه|الشركة).{0,24}(?:سياسه|سياسة)|company\s+policy|سياساتنا/iu;

const PRODUCT_FILLER = new Set([
  "عايز",
  "عاوز",
  "طب",
  "طيب",
  "اعرف",
  "ايه",
  "اي",
  "عن",
  "عندكم",
  "عندكو",
  "عندك",
  "عندنا",
  "في",
  "من",
  "لو",
  "سمحت",
  "فضلك",
  "قولي",
  "قول",
  "وريني",
  "عرفني",
  "تعرفني",
  "تفاصيل",
  "التفاصيل",
  "وصف",
  "الوصف",
  "معلومات",
  "المعلومات",
  "عن",
  "ع",
  "صور",
  "صوره",
  "صورة",
  "الصور",
  "صورته",
  "صورتها",
  "صورهم",
  "photo",
  "photos",
  "pic",
  "pics",
  "picture",
  "pictures",
  "gallery",
  "image",
  "images",
  "ممكن",
  "عنه",
  "عنها",
  "عنهم",
  "ده",
  "دي",
  "دول",
  "هذا",
  "هذه",
  "اكتر",
  "أكتر",
  "سعر",
  "سعره",
  "سعرها",
  "سعرهم",
  "السعر",
  "اسعار",
  "أسعار",
  "بكام",
  "بكم",
  "ثمن",
  "تكلف",
  "تكلفة",
  "كام",
  "شامل",
  "الضريبة",
  "الضريبه",
  "ضريبة",
  "ضريبه",
  "vat",
  "included",
  "inclusive",
  "exclusive",
  "المنتجات",
  "المنتج",
  "منتج",
  "منتجات",
  "منتجاتكم",
  "منتجاتنا",
  "منتجاتك",
  "منتجاتكو",
  "product",
  "products",
  "كتالوج",
  "catalog",
  "نوع",
  "النوع",
  "رمز",
  "الرمز",
  "كود",
  "الكود",
  "sku",
  "محتاج",
  "price",
  "prices",
  "cost",
  "how",
  "much",
  "details",
  "detail",
  "description",
  "info",
  "information",
  "tell",
  "more",
  "about",
  // Relative / listing filler — must not become a product search term.
  "اللي",
  "اللى",
  "الي",
  "الى",
  "الذي",
  "التي",
  "التى",
  "موجود",
  "الموجود",
  "متاح",
  "المتاح",
  "متاحه",
  "المتاحه",
  "available",
  "what",
  "which",
  "that",
  "your",
  "you",
  "have",
  "got",
  "list",
  "show",
  "me",
  "is",
  "the",
  "a",
  "an",
  "of",
  "for",
  "and",
  "it",
  "its",
  "this",
  "these",
  "those",
  "on",
  "to",
  "do",
  "does",
  "be",
  "good",
  "well",
  "life",
  "battery",
  "waterproof",
  "hours",
  "hour",
  "noise",
  "cancelling",
  "canceling",
  "opinion",
  "think",
  "ما",
  "هل",
  "وهل",
  "رأيك",
  "رايك",
  "جيدة",
  "جيده",
  "كويسة",
  "كويسه",
  "كويس",
  "بطارية",
  "البطارية",
  "البطاريه",
  // Remaining / other products — never a product name.
  "باقي",
  "باقى",
  "بقية",
  "تاني",
  "التاني",
  "التانية",
  "التانيين",
  "اخرى",
  "أخرى",
  "الاخرى",
  "الأخرى",
  "كل",
  "جميع",
  "rest",
  "remaining",
  "other",
  "others",
  "all",
  "فات",
  "فاتت",
  "السابق",
  "الاول",
  "الأول",
  "التاني",
  "الثاني",
  "الاخير",
  "الأخير",
  "قبل",
  "كده",
  "قارن",
  "مقارنه",
  "مقارنة",
  "الفرق",
  "versus",
  "compare",
  "vs",
  "ضمان",
  "الضمان",
  "warranty",
  "تقسيط",
  "خصم",
  "خصومات",
  "ضريبة",
  "ضريبه",
  "توصيل",
  "التوصيل",
  "الشحن",
  "delivery",
  "shipping",
  "installment",
  "discount",
  "tax",
  "taxes",
  "طب",
  "مواصفات",
  "المواصفات",
  "specification",
  "specs",
  "spec",
  "refund",
  "فيه",
]);

const PRODUCT_LIST_LIMIT = 12;
const PRODUCT_LOOKUP_LIMIT = 5;
const PRODUCT_DETAIL_BATCH_LIMIT = 5;

function arabicWordKey(word: string): string {
  return word.toLocaleLowerCase().replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
}

function looksLikeCompanyPolicyQuestion(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || /(?:احجز|أحجز)/u.test(trimmed)) return false;
  return POLICY_QUESTION.test(trimmed);
}

function looksLikeProductQuestion(value: string): boolean {
  return looksLikeProductCatalogQuestion(value);
}

function looksLikeCompanyOrServicesQuestion(value: string): boolean {
  return (
    looksLikeCompanyIntroQuestion(value) ||
    /(?:شركه|شركة|شركتكم|شركتك|خدماتكم|خدمتكم|خدمتنا|خدماتنا|عنكم|عن\s*العياد|about\s+(?:the\s+)?company|your\s+company|\bservices\b)/iu.test(
      value,
    )
  );
}

/** Details for several / remaining catalog products (not one named product). */
function looksLikeMultiProductDetailQuestion(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  // "عايز اعرف تفاصيل عن المنتجات" / "معلومات عن المنتجات" — list titles, wait for a pick.
  return (
    /(?:تفاصيل|التفاصيل|معلومات|المعلومات|وصف|الوصف).{0,40}(?:باقي|باقى|بقية|التاني|التانية|الاخرى|الأخرى|كل|جميع).{0,20}(?:منتج|المنتجات|منتجاتكم|منتجاتنا|products?)/iu.test(
      trimmed,
    ) ||
    /(?:باقي|باقى|بقية|كل|جميع).{0,20}(?:المنتجات|منتجاتكم|products?).{0,40}(?:تفاصيل|معلومات|وصف)/iu.test(
      trimmed,
    ) ||
    /(?:تفاصيل|معلومات|وصف).{0,32}(?:المنتجات|منتجاتكم|منتجاتنا|منتجاتك|products?\b)/iu.test(trimmed) ||
    /(?:اعرف|أشوف|اشوف|وريني).{0,32}(?:تفاصيل|معلومات|وصف).{0,32}(?:المنتجات|منتجاتكم|منتجاتنا|products?\b)/iu.test(
      trimmed,
    )
  );
}

/** "تعرفني ع منتجاتكم" / "قولي منتجاتك ايه" — list the catalog, do not search filler as a name. */
function looksLikeProductCatalogIntroQuestion(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || /(?:احجز|أحجز|هحجز|حجز|ميعاد|موعد|book)/iu.test(trimmed)) return false;
  if (looksLikeMultiProductDetailQuestion(trimmed)) return false;
  return /(?:عرفني|تعرفني|قولي|تقولي|قولّي|وريني|ايه|إيه|what).{0,32}(?:المنتجات|منتجاتكم|منتجاتنا|منتجاتك|منتجاتكو|منتجات|كتالوج|products?\b)|(?:المنتجات|منتجاتكم|منتجاتنا|منتجاتك|منتجاتكو|منتجات|كتالوج|products?\b).{0,24}(?:ايه|إيه|what|عندك|عندكم|عندكو|available)/iu.test(
    trimmed,
  );
}

function looksLikeProductDetailQuestion(
  value: string,
  messages: RuntimeGatewayChatRequest["messages"] = [],
): boolean {
  const trimmed = value.trim();
  if (!trimmed || /(?:احجز|أحجز|هحجز|حجز|ميعاد|موعد|book)/iu.test(trimmed)) return false;
  // Catalog intro ("تعرفني عن منتجاتكم") is a listing turn, not a missing single product.
  if (looksLikeProductCatalogIntroQuestion(trimmed)) return false;
  if (
    !/(?:وصف|الوصف|تفاصيل|التفاصيل|معلومات|المعلومات|مواصفات|المواصفات|عرفني|تعرفني|اكتر\s+عن|أكتر\s+عن|details?|description|specification|\bspecs?\b|tell\s+me\s+(?:more\s+)?about)/iu.test(
      trimmed,
    )
  ) {
    return false;
  }
  // "عرفني عن الشركة / خدماتكم" is not a catalog product detail ask.
  if (looksLikeCompanyOrServicesQuestion(trimmed) && !/(?:منتج|المنتج|منتجات|المنتجات|كتالوج|sku|\bproduct)/iu.test(trimmed)) {
    return false;
  }
  if (looksLikeMultiProductDetailQuestion(trimmed)) return true;
  if (/(?:منتج|المنتج|منتجات|المنتجات|كتالوج|عقار|العقار|sku|\bproduct)/iu.test(trimmed)) return true;
  if (lastOfferedCatalogProducts(messages).length > 0) return true;
  return productQueryFromText(trimmed).length > 0;
}

function looksLikeProductPhotoQuestion(value: string): boolean {
  return customerRequestedProductPhotos(value);
}

function looksLikeProductCompareQuestion(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || /(?:احجز|أحجز|هحجز|حجز|ميعاد|موعد|book)/iu.test(trimmed)) return false;
  return /(?:قارن|مقارن[ةه]|الفرق بين|versus|\bvs\.?\b|compare)/iu.test(trimmed);
}

function looksLikePreviousProductRef(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /(?:اللي فات|اللى فات|السابق|قبل كده|المنتج السابق)/iu.test(trimmed);
}

/** Ordinal inside the last catalog list. "باقي المنتجات" stays a browse, not "the second item". */
function catalogListOrdinal(value: string): "first" | "second" | "last" | null {
  const folded = foldCatalogText(value);
  if (/(?:باقي|باقى|بقية|كل المنتجات|جميع)/u.test(value)) return null;
  if (/(?:^|\s)(?:الاول|الاولى)(?:\s|$)|the first/iu.test(folded)) return "first";
  if (/(?:التاني|الثاني|التانى)|the (?:other|second)/iu.test(folded)) return "second";
  if (/(?:الاخير|الاخيره)|the last/iu.test(folded)) return "last";
  return null;
}

function looksLikeProductTaxInclusionQuestion(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || /(?:احجز|أحجز|هحجز|حجز|ميعاد|موعد|book)/iu.test(trimmed)) return false;
  return /(?:شامل(?:ة)?\s*(?:ال)?ضري[بةه]|غير\s*شامل(?:ة)?\s*(?:ال)?ضري[بةه]|includes?\s+(?:the\s+)?(?:sales\s+)?(?:tax|vat)|(?:tax|vat)[\s-]*included|with(?:out)?\s+(?:the\s+)?(?:tax|vat)|price\s+incl)/iu.test(
    trimmed,
  );
}

function unsupportedProductFactNote(
  value: string,
  language: CustomerReplyLanguage = "ar",
): string | null {
  const folded = `${value}\n${foldCatalogText(value)}`;
  const claims: Array<{ ar: string; en: string; de: string }> = [];
  if (/(?:ضمان|الضمان|warranty|garantie)/iu.test(folded)) {
    claims.push({ ar: "الضمان", en: "warranty", de: "Garantie" });
  }
  if (/(?:توصيل|التوصيل|الشحن|delivery|shipping|lieferung)/iu.test(folded)) {
    claims.push({ ar: "التوصيل", en: "delivery", de: "Lieferung" });
  }
  if (/(?:تقسيط|قسط|أقساط|اقساط|installment|ratenzahlung)/iu.test(folded)) {
    claims.push({ ar: "التقسيط", en: "installments", de: "Ratenzahlung" });
  }
  if (
    !looksLikeProductTaxInclusionQuestion(value) &&
    /(?:ضريبه|ضريبة|الضرائب|\bvat\b|\btaxes?\b|steuern)/iu.test(folded)
  ) {
    claims.push({ ar: "الضرائب", en: "taxes", de: "Steuern" });
  }
  if (/(?:خصم|خصومات|تخفيض|discount|rabatt)/iu.test(folded)) {
    claims.push({ ar: "الخصم", en: "the discount", de: "Rabatt" });
  }
  if (/(?:استرجاع|استرداد|مرتجع|refund|return policy|rückgabe)/iu.test(folded)) {
    claims.push({ ar: "الاسترجاع", en: "returns", de: "Rückgabe" });
  }
  if (/(?:توافق|compatibility|kompatibilität)/iu.test(folded)) {
    claims.push({ ar: "التوافق", en: "compatibility", de: "Kompatibilität" });
  }
  if (claims.length === 0) return null;
  if (language === "en") {
    const labels = claims.map((claim) => claim.en);
    return labels.length === 1
      ? `The catalog does not list ${labels[0]}.`
      : `The catalog does not list: ${labels.join(", ")}.`;
  }
  if (language === "de") {
    const labels = claims.map((claim) => claim.de);
    return labels.length === 1
      ? `Im Katalog ist keine Angabe zu ${labels[0]} hinterlegt.`
      : `Im Katalog sind keine Angaben hinterlegt: ${labels.join(", ")}.`;
  }
  if (claims.length === 1) return `معلومة ${claims[0]!.ar} مش مسجّلة في الكتالوج.`;
  return `المعلومات دي مش مسجّلة في الكتالوج: ${claims.map((claim) => claim.ar).join(" و")}.`;
}

function looksLikeUnsupportedProductFactQuestion(value: string): boolean {
  return unsupportedProductFactNote(value) != null;
}

function looksLikeCatalogProductPriceQuestion(
  value: string,
  messages: RuntimeGatewayChatRequest["messages"],
): boolean {
  if (!looksLikePriceQuestion(value)) return false;
  if (/(?:احجز|أحجز|هحجز|حجز|ميعاد|موعد|book)/iu.test(value)) return false;
  // "السعر شامل الضريبة؟" asks inclusion only — do not force a price quote unless they also ask بكام/how much.
  if (
    looksLikeProductTaxInclusionQuestion(value) &&
    !/(?:بكام|بكم|how\s+much|\bprices?\b|اسعار|أسعار)/iu.test(value)
  ) {
    return false;
  }
  // Last assistant may be a short confirm without SKU lines — still use catalog history.
  if (lastOfferedCatalogProducts(messages).length > 0) return true;
  if (offeredCatalogHistory(messages).length > 0) return true;
  if (/(?:منتج|المنتج|عقار|العقار|اشتراك|حزم|كتالوج|sku|\bproduct\b|\bprodukt(?:e|en)?\b)/iu.test(value)) return true;
  const query = productQueryFromText(value);
  // "ما السعر؟" / "What is the price?" keeps the product from an earlier turn.
  if (!query) return true;
  // Keep scheduling price questions (كشف / استشارة / دكتور) on the booking path.
  if (/(?:كشف|استشار|دكتور|طبيب|موعد|ميعاد)/iu.test(value)) return false;
  return true;
}

/** Price for several / all catalog products (not one named product). */
function looksLikeMultiProductPriceQuestion(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || !looksLikePriceQuestion(trimmed)) return false;
  if (/(?:احجز|أحجز|هحجز|حجز|ميعاد|موعد|book)/iu.test(trimmed)) return false;
  return /(?:اسعار|أسعار|سعر|بكام|بكم|prices?).{0,28}(?:المنتجات|المنتجات|products?)|(?:المنتجات|المنتجات|products?).{0,28}(?:اسعار|أسعار|سعر|بكام|بكم|كام|prices?)|(?:كل|جميع|باقي|باقى).{0,20}(?:الاسعار|الأسعار|اسعار|أسعار|prices?)/iu.test(
    trimmed,
  );
}

function productQueryFromText(value: string, typeCode: ProductTypeChatCode | null = null): string {
  const words = value
    .replace(/[?؟!.،,]+/gu, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => {
      if (word.length < 2) return false;
      const key = arabicWordKey(word);
      const stem = arabicCatalogWordStem(word);
      const bare = key.replace(/^و/, "").replace(/^ال/, "");
      if (PRODUCT_FILLER.has(key) || PRODUCT_FILLER.has(stem) || PRODUCT_FILLER.has(bare)) return false;
      // Type words drive the filter, not the free-text query.
      if (typeCode && isProductTypeAlias(word)) return false;
      if (typeCode && isProductTypeAlias(stem)) return false;
      return true;
    })
    .map((word) => {
      const key = arabicWordKey(word);
      return key.startsWith("ال") && key.length > 4 ? key.slice(2) : word;
    });
  return words.slice(0, 6).join(" ");
}

/** Products offered in the last assistant catalog reply (name + sku). */
function parseOfferedCatalogProducts(text: string): Array<{ name: string; sku: string }> {
  const found: Array<{ name: string; sku: string }> = [];
  const listPattern = /^[-•*]\s*(.+?)\s*\(([^)\n]{2,40})\)\s*$/gmu;
  for (const match of text.matchAll(listPattern)) {
    const name = match[1]?.trim() ?? "";
    const sku = match[2]?.trim() ?? "";
    if (name && sku) found.push({ name, sku });
  }
  if (found.length > 0) return found;
  const skuMatch = text.match(/(?:الرمز|رمز|sku)\s*[:：]?\s*([A-Za-z0-9][A-Za-z0-9._-]{1,39})/iu);
  if (skuMatch?.[1]) {
    const nameLine = text
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line && !/(?:الرمز|رمز|النوع|الفئة|الوصف|السعر|sku)/iu.test(line));
    return [{ name: nameLine ?? skuMatch[1], sku: skuMatch[1] }];
  }
  return [];
}

function lastOfferedCatalogProducts(
  messages: RuntimeGatewayChatRequest["messages"],
): Array<{ name: string; sku: string }> {
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  const text = typeof lastAssistant?.content === "string" ? lastAssistant.content : "";
  return text ? parseOfferedCatalogProducts(text) : [];
}

function offeredCatalogHistory(
  messages: RuntimeGatewayChatRequest["messages"],
): Array<{ name: string; sku: string }> {
  const found: Array<{ name: string; sku: string }> = [];
  const seen = new Set<string>();
  let assistants = 0;
  for (const message of [...messages].reverse()) {
    if (message.role !== "assistant") continue;
    assistants += 1;
    if (assistants > 8) break;
    const text = typeof message.content === "string" ? message.content : "";
    for (const item of parseOfferedCatalogProducts(text).reverse()) {
      const key = arabicWordKey(item.sku);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      found.push(item);
    }
  }
  return found.reverse();
}

function catalogProductLabels(text: string): string[] {
  const matches = text.match(/\b[A-Z][\p{L}\p{N}]*(?:\s+[A-Z][\p{L}\p{N}]*)+/gu) ?? [];
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const match of matches) {
    const label = match.trim();
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }
  return labels;
}

/** Product names the customer already wrote. Assistant cards stay on the older resolvers. */
function priorCatalogProductLabels(
  messages: Array<{ role: string; content?: unknown }>,
): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  const add = (label: string) => {
    const cleaned = label.trim();
    const key = cleaned.toLowerCase();
    if (cleaned.length < 2 || seen.has(key)) return;
    seen.add(key);
    labels.push(cleaned);
  };
  const users = messages.filter((message) => message.role === "user");
  for (const message of users.slice(0, -1)) {
    const text = typeof message.content === "string" ? message.content : "";
    for (const label of catalogProductLabels(text)) add(label);
  }
  return labels;
}

function catalogFollowUpAsk(language: CustomerReplyLanguage, labels: string[]): string {
  const list = labels.map((label) => `- ${label}`).join("\n");
  if (language === "en") {
    return labels.length > 1
      ? `Which product do you mean?\n${list}`
      : "Which product do you mean? Send the name or SKU.";
  }
  if (language === "de") {
    return labels.length > 1
      ? `Welches Produkt meinen Sie?\n${list}`
      : "Welches Produkt meinen Sie? Senden Sie den Namen oder die SKU.";
  }
  return labels.length > 1 ? `تقصد أنهي منتج؟\n${list}` : "قولي اسم المنتج أو رمزه.";
}

function catalogSelectionTokens(text: string): string[] {
  const query = productQueryFromText(text);
  const source = query || text;
  return source
    .split(/\s+/)
    .map((word) => arabicWordKey(word.trim()))
    .map((token) => (token.startsWith("ال") && token.length > 4 ? token.slice(2) : token))
    .filter((token) => token.length >= 2);
}

function catalogItemMatchesSelection(
  item: { name: string; sku: string },
  tokens: string[],
): boolean {
  if (tokens.length === 0) return false;
  const nameKey = arabicWordKey(item.name);
  const skuKey = arabicWordKey(item.sku);
  if (tokens.some((token) => token === skuKey || skuKey.includes(token))) return true;
  const strong = tokens.filter((token) => token.length >= 3);
  const pool = strong.length > 0 ? strong : tokens;
  const hits = pool.filter((token) => nameKey.includes(token));
  return hits.length >= Math.max(1, Math.ceil(pool.length * 0.6));
}

/**
 * When the customer already named/selected a product from a multi-item list,
 * a later bare "بكام؟" must reuse that selection — not ask "أنهي منتج؟" again.
 */
function matchOfferedProductFromRecentUserTurns(
  messages: RuntimeGatewayChatRequest["messages"],
  offered: Array<{ name: string; sku: string }>,
): { name: string; sku: string } | null {
  if (offered.length < 2) return offered[0] ?? null;
  const userTurns: string[] = [];
  for (const message of [...messages].reverse()) {
    if (message.role !== "user") continue;
    const text = typeof message.content === "string" ? message.content.trim() : "";
    if (!text) continue;
    userTurns.push(text);
    if (userTurns.length >= 8) break;
  }
  const selectionTurns = userTurns.filter((text) => {
    const query = productQueryFromText(text);
    // Skip bare price / photo pronouns — those are follow-ups, not a selection.
    if (!query && (looksLikePriceQuestion(text) || looksLikeProductPhotoQuestion(text))) return false;
    if (catalogListOrdinal(text)) return false;
    return Boolean(query) || text.length >= 2;
  });
  const matched: Array<{ name: string; sku: string }> = [];
  const seen = new Set<string>();
  for (const text of selectionTurns) {
    const tokens = catalogSelectionTokens(text);
    if (tokens.length === 0) continue;
    for (const item of offered) {
      const skuKey = arabicWordKey(item.sku);
      if (!catalogItemMatchesSelection(item, tokens) || seen.has(skuKey)) continue;
      seen.add(skuKey);
      matched.push(item);
    }
  }
  return matched.length === 1 ? matched[0]! : null;
}

function companyKnowledgeBody(messages: RuntimeGatewayChatRequest["messages"]): string {
  const blob = messages
    .filter((message) => message.role === "system")
    .map((message) => String(message.content ?? ""))
    .join("\n");
  const marker =
    "Use the following company knowledge to answer accurately. Cite sources internally when referencing facts.";
  const start = blob.indexOf(marker);
  if (start < 0) return "";
  let text = blob.slice(start + marker.length);
  const end = text.search(/\n(?:Retrieval confidence:|Available citations:|CHANNEL SENDER:|SCHEDULING CATALOG)/);
  if (end >= 0) text = text.slice(0, end);
  return text
    .split(/\n{2,}/)
    .map((block) => block.replace(/^\[[^\]]{1,80}\]\s*/u, "").trim())
    .filter((block) => block.length > 0)
    .slice(0, 3)
    .join("\n\n")
    .slice(0, 900)
    .trim();
}

function companyPolicyReply(messages: RuntimeGatewayChatRequest["messages"]): string {
  const body = companyKnowledgeBody(messages);
  return body ? `من سياسة الشركة:\n${body}` : "سياسة الشركة مش متسجلة في المعرفة دلوقتي.";
}

function companyAboutReply(messages: RuntimeGatewayChatRequest["messages"]): string {
  const body = companyKnowledgeBody(messages);
  return body
    ? `عن الشركة:\n${body}`
    : "معلومات تعريف الشركة مش متسجلة في المعرفة دلوقتي. أقدر أساعدك بالمنتجات أو الحجز لو حابب.";
}

function companyServicesAboutReply(messages: RuntimeGatewayChatRequest["messages"]): string {
  const body = companyKnowledgeBody(messages);
  if (body) {
    return `عن خدماتنا:\n${body}\n\nلو عايز قائمة خدمات الكتالوج بالاسم، قولّي «ايه الخدمات اللي عندكم».`;
  }
  return "مفيش تعريف مسجّل لخدمات الشركة في المعرفة دلوقتي. لو قصدك خدمات الكتالوج، قولّي «ايه الخدمات اللي عندكم». أو أقدر أساعدك في الحجز.";
}

function productRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function productText(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function productTypeLabel(type: string): string {
  return productTypeChatDef(type)?.labelAr ?? type;
}

function productMatchesTerms(
  record: Record<string, unknown>,
  terms: string[],
  typeCode: ProductTypeChatCode | null = null,
): boolean {
  if (typeCode && productText(record, "productType") !== typeCode) return false;
  if (terms.length === 0) return true;
  const category = productRecord(record.category);
  const productAliases = Array.isArray(record.aliases)
    ? record.aliases.filter((entry): entry is string => typeof entry === "string").join(" ")
    : "";
  const haystack = [
    productText(record, "name"),
    productText(record, "sku"),
    productText(record, "brand"),
    productText(record, "summary"),
    productText(record, "description"),
    productAliases,
    category ? productText(category, "name") : "",
  ]
    .join(" ")
    .toLocaleLowerCase();
  const typeDef = productTypeChatDef(productText(record, "productType"));
  const typeAliases = (typeDef?.aliases ?? []).map(arabicWordKey);
  return terms.some((term) => {
    const key = arabicWordKey(term);
    return haystack.includes(term.toLocaleLowerCase()) || typeAliases.includes(key);
  });
}

/** Compact list/clarifier title: Name (SKU) only when both exist — never empty parentheses. */
function formatProductLine(record: Record<string, unknown>): string {
  const name = productText(record, "name");
  const sku = productText(record, "sku");
  if (name && sku) return `${name} (${sku})`;
  return name || sku;
}

/** Same Name (SKU) contract for offered-catalog clarifiers parsed from history. */
function formatOfferedCatalogLine(item: { name: string; sku: string }): string {
  const name = item.name.trim();
  const sku = item.sku.trim();
  if (name && sku) return `${name} (${sku})`;
  return name || sku;
}

/** Display title used in price/photo captions — same Name (SKU) contract as lists. */
function formatProductDisplayTitle(record: Record<string, unknown>, fallback: string): string {
  return formatProductLine(record) || fallback;
}

function productTypeLabelLocalized(type: string, language: CustomerReplyLanguage): string {
  if (language === "en") {
    const labels: Record<string, string> = {
      product: "Product",
      service: "Service",
      subscription: "Subscription",
      bundle: "Bundle",
      addon: "Add-on",
      real_estate: "Real estate",
      digital: "Digital",
    };
    return labels[type] ?? type;
  }
  if (language === "de") {
    const labels: Record<string, string> = {
      product: "Produkt",
      service: "Dienstleistung",
      subscription: "Abo",
      bundle: "Paket",
      addon: "Zusatz",
      real_estate: "Immobilie",
      digital: "Digital",
    };
    return labels[type] ?? type;
  }
  return productTypeLabel(type);
}

/**
 * Detail / compare card — fixed field order for every locale:
 * Name → SKU → Type → Category → Brand → Description → Price → tax.
 * SKU sits on its own line under the name (scannable, professional).
 */
/** Strip tax-inclusion copy that was pasted into catalog description/summary fields. */
function stripEmbeddedProductTaxPhrase(value: string): string {
  // Preserve author newlines — collapsing \\s+ was gluing WhatsApp descriptions into one blob.
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) =>
      line
        .replace(
          /[.\s]*(?:السعر\s*)?(?:شامل|غير\s*شامل)\s*الضريبة\.?/giu,
          "",
        )
        .replace(
          /[.\s]*(?:The\s+)?price\s+(?:includes|does\s+not\s+include)\s+tax\.?/giu,
          "",
        )
        .replace(
          /[.\s]*(?:Der\s+Preis\s+)?(?:enthält|enthält\s+nicht)\s+die\s+Steuer\.?/giu,
          "",
        )
        .replace(/[^\S\n]{2,}/g, " ")
        .replace(/[^\S\n]+([.!?،])/gu, "$1")
        .trimEnd(),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Keep Enter line breaks for WhatsApp, and soft-break after sentence punctuation
 * so "جملة. جملة" is not one sticky paragraph on the customer's phone.
 * WhatsApp markdown (*bold* / _italic_) is left intact.
 */
function formatProductDescriptionForChat(description: string): string {
  const cleaned = stripEmbeddedProductTaxPhrase(description);
  if (!cleaned) return "";
  return cleaned
    .replace(/([.!?؟。])[^\S\n]+(?=[\p{L}\p{N}«"'“])/gu, "$1\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pushFormattedProductDescription(
  lines: string[],
  description: string,
  language: CustomerReplyLanguage,
): void {
  const formatted = formatProductDescriptionForChat(description);
  if (!formatted) {
    if (language === "en") lines.push("No description is recorded for this product.");
    else if (language === "de") lines.push("Für dieses Produkt ist keine Beschreibung hinterlegt.");
    else lines.push("مفيش وصف مسجّل للمنتج ده دلوقتي.");
    return;
  }
  const label =
    language === "en" ? "Description:" : language === "de" ? "Beschreibung:" : "الوصف:";
  const bodyLines = formatted.split("\n").map((line) => line.trimEnd()).filter((line) => line.length > 0);
  if (bodyLines.length <= 1) {
    lines.push(`${label} ${bodyLines[0] ?? formatted}`);
    return;
  }
  lines.push(label);
  lines.push(...bodyLines);
}

function formatProductDetail(
  record: Record<string, unknown>,
  options?: { includePrice?: boolean; language?: CustomerReplyLanguage },
): string {
  const includePrice = options?.includePrice !== false;
  const language = options?.language ?? "ar";
  const name = productText(record, "name") || productText(record, "sku");
  const lines = [name];
  const sku = productText(record, "sku");
  const type = productText(record, "productType");
  const category = productRecord(record.category);
  const categoryName = category ? productText(category, "name") : "";
  const brand = productText(record, "brand");
  // Never let stored description leak "السعر شامل الضريبة" when we are not quoting a price.
  const description = productText(record, "description") || productText(record, "summary");
  const typeLabel = type ? productTypeLabelLocalized(type, language) : "";
  if (language === "en") {
    if (sku) lines.push(`SKU: ${sku}`);
    if (typeLabel) lines.push(`Type: ${typeLabel}`);
    if (categoryName) lines.push(`Category: ${categoryName}`);
    if (brand) lines.push(`Brand: ${brand}`);
  } else if (language === "de") {
    if (sku) lines.push(`SKU: ${sku}`);
    if (typeLabel) lines.push(`Typ: ${typeLabel}`);
    if (categoryName) lines.push(`Kategorie: ${categoryName}`);
    if (brand) lines.push(`Marke: ${brand}`);
  } else {
    if (sku) lines.push(`الرمز: ${sku}`);
    if (typeLabel) lines.push(`النوع: ${typeLabel}`);
    if (categoryName) lines.push(`الفئة: ${categoryName}`);
    if (brand) lines.push(`العلامة: ${brand}`);
  }
  pushFormattedProductDescription(lines, description, language);
  if (includePrice) {
    const amountLine = formatProductAmountLine(record, language);
    if (amountLine) {
      if (language === "en") lines.push(`Price: ${amountLine}`);
      else if (language === "de") lines.push(`Preis: ${amountLine}`);
      else lines.push(`السعر: ${amountLine}`);
      // Tax phrase rides with the price line only — never after description alone.
      const taxLine = formatProductTaxInclusion(record, { compact: true, language });
      if (taxLine) lines.push(taxLine);
    }
  }
  return lines.filter(Boolean).join("\n");
}

function productTaxIncluded(record: Record<string, unknown>): boolean | null {
  const tax = productRecord(record.tax);
  if (tax && typeof tax.included === "boolean") return tax.included;
  return null;
}

/** `tax.mode === "unspecified"`: the company chose not to mention tax to customers. */
function productTaxUnspecified(record: Record<string, unknown>): boolean {
  const tax = productRecord(record.tax);
  return tax?.mode === "unspecified";
}

function formatProductTaxInclusion(
  record: Record<string, unknown>,
  options?: { compact?: boolean; language?: CustomerReplyLanguage },
): string {
  if (productTaxUnspecified(record)) return "";
  const language = options?.language ?? "ar";
  const included = productTaxIncluded(record);
  const name = productText(record, "name") || productText(record, "sku") || (language === "de" ? "das Produkt" : language === "en" ? "the product" : "المنتج");
  if (included == null) {
    if (options?.compact) return "";
    if (language === "en") return "Tax is not recorded in the catalog.";
    if (language === "de") return "Die Steuer ist im Katalog nicht hinterlegt.";
    return "معلومة الضريبة مش مسجّلة في الكتالوج.";
  }
  if (language === "en") {
    if (options?.compact) return included ? "The price includes tax." : "The price does not include tax.";
    return included ? `The price of ${name} includes tax.` : `The price of ${name} does not include tax.`;
  }
  if (language === "de") {
    if (options?.compact) return included ? "Der Preis enthält die Steuer." : "Der Preis enthält die Steuer nicht.";
    return included
      ? `Der Preis von ${name} enthält die Steuer.`
      : `Der Preis von ${name} enthält die Steuer nicht.`;
  }
  if (options?.compact) {
    return included ? "السعر شامل الضريبة." : "السعر غير شامل الضريبة.";
  }
  return included ? `سعر ${name} شامل الضريبة.` : `سعر ${name} غير شامل الضريبة.`;
}

function productImageCount(record: Record<string, unknown>): number {
  if (typeof record.imageCount === "number" && Number.isFinite(record.imageCount)) {
    return Math.max(0, Math.floor(record.imageCount));
  }
  if (Array.isArray(record.deliveryImages)) return record.deliveryImages.length;
  return 0;
}

/** Short caption; WhatsApp sends the actual photos from tool deliveryImages. */
function formatProductPhotoReply(
  record: Record<string, unknown>,
  language: CustomerReplyLanguage = "ar",
): string {
  const fallback = language === "de" ? "das Produkt" : language === "en" ? "the product" : "المنتج";
  const title = formatProductDisplayTitle(record, fallback);
  if (productImageCount(record) > 0) {
    if (language === "en") return `Photos of ${title}:`;
    if (language === "de") return `Fotos von ${title}:`;
    return `دي صور ${title}:`;
  }
  if (language === "en") return `No photos are recorded for ${title}.`;
  if (language === "de") return `Für ${title} sind keine Fotos hinterlegt.`;
  return `مفيش صور مسجّلة لـ ${title} دلوقتي.`;
}

/** Amount + currency (+ subscription interval) without the "Price of Name" prefix. */
function formatProductAmountLine(
  record: Record<string, unknown>,
  language: CustomerReplyLanguage = "ar",
): string | null {
  const subscription = productRecord(record.subscription);
  if (
    subscription &&
    typeof subscription.amount === "number" &&
    typeof subscription.currency === "string"
  ) {
    const interval =
      typeof subscription.interval === "string" && subscription.interval.trim()
        ? ` / ${subscriptionIntervalLabel(subscription.interval.trim(), language)}`
        : "";
    return `${subscription.amount} ${subscription.currency}${interval}`;
  }
  const price = productRecord(record.price);
  if (price?.status === "listed" && typeof price.amount === "number" && typeof price.currency === "string") {
    return `${price.amount} ${price.currency}`;
  }
  return null;
}

function subscriptionIntervalLabel(interval: string, language: CustomerReplyLanguage = "ar"): string {
  if (language === "en") {
    if (interval === "month") return "per month";
    if (interval === "year") return "per year";
    if (interval === "quarter") return "per quarter";
    return interval;
  }
  if (language === "de") {
    if (interval === "month") return "pro Monat";
    if (interval === "year") return "pro Jahr";
    if (interval === "quarter") return "pro Quartal";
    return interval;
  }
  if (interval === "month") return "شهرياً";
  if (interval === "year") return "سنوياً";
  if (interval === "quarter") return "كل ربع سنة";
  return interval;
}

function formatProductPriceOnly(
  record: Record<string, unknown>,
  language: CustomerReplyLanguage = "ar",
): string {
  const fallback = language === "de" ? "das Produkt" : language === "en" ? "the product" : "المنتج";
  const title = formatProductDisplayTitle(record, fallback);
  const pricePrefix =
    language === "en" ? `Price of ${title}` : language === "de" ? `Preis von ${title}` : `سعر ${title}`;
  const amountLine = formatProductAmountLine(record, language);
  if (amountLine) {
    const taxLine = formatProductTaxInclusion(record, { compact: true, language });
    return taxLine ? `${pricePrefix}: ${amountLine}\n${taxLine}` : `${pricePrefix}: ${amountLine}`;
  }
  if (language === "en") return `The price of ${title} is not available right now.`;
  if (language === "de") return `Der Preis von ${title} ist derzeit nicht verfügbar.`;
  return `سعر ${title} غير متاح حاليًا.`;
}

function formatProductFacing(
  output: Record<string, unknown> | null,
  specific: boolean,
  typeCode: ProductTypeChatCode | null = null,
  language: CustomerReplyLanguage = "ar",
): string {
  const typeDef = productTypeChatDef(typeCode);
  const products = (Array.isArray(output?.products) ? output.products : [])
    .map(productRecord)
    .filter((record): record is Record<string, unknown> => Boolean(record));
  if (products.length === 0) {
    if (language === "en") {
      return specific
        ? "I could not find a product with that description. Send the product name or SKU."
        : "No products are available right now.";
    }
    if (language === "de") {
      return specific
        ? "Dazu habe ich kein Produkt gefunden. Senden Sie den Namen oder die SKU."
        : "Derzeit sind keine Produkte verfügbar.";
    }
    if (specific) return typeDef?.notFound ?? "ملقتش منتج بالوصف ده. ابعت اسم المنتج أو رمزه.";
    return typeDef?.emptyList ?? "مفيش منتجات متاحة دلوقتي.";
  }
  // Named-product hit: details only — never attach price/tax/photos unless the customer asked.
  if (specific && products.length === 1) {
    return formatProductDetail(products[0]!, { includePrice: false, language });
  }
  const intro =
    language === "en"
      ? specific
        ? "I found these products:"
        : "Available products:"
      : language === "de"
        ? specific
          ? "Ich habe diese Produkte gefunden:"
          : "Verfügbare Produkte:"
        : specific
          ? typeCode
            ? `لقيت من ${typeDef?.labelAr ?? "المنتجات"}:`
            : "لقيت المنتجات دي:"
          : (typeDef?.listIntro ?? "المنتجات المتاحة:");
  const nudge =
    language === "en"
      ? "Send a product name or SKU if you want one of them."
      : language === "de"
        ? "Senden Sie einen Namen oder eine SKU, wenn Sie ein bestimmtes Produkt möchten."
        : typeCode
          ? `لو عايز ${typeDef?.labelAr ?? "منتج"} معين ابعت اسمه أو رمزه.`
          : "لو عايز منتج معين ابعت اسمه أو رمزه.";
  const truncated = output?.truncated === true;
  const more = truncated
    ? language === "en"
      ? "There are more results. Send a more specific name or category."
      : language === "de"
        ? "Es gibt weitere Ergebnisse. Senden Sie einen genaueren Namen oder eine Kategorie."
        : "في نتائج تانية كمان — لو حابب قولي اسم أو فئة أدق."
    : null;
  return [intro, ...products.map((record) => `- ${formatProductLine(record)}`), nudge, more]
    .filter(Boolean)
    .join("\n");
}

function moreProductDetails(count: number, language: CustomerReplyLanguage): string {
  if (language === "en") {
    return `\n\nThere are ${count} more products. Send a name or SKU for a specific one.`;
  }
  if (language === "de") {
    return `\n\nEs gibt ${count} weitere Produkte. Senden Sie einen Namen oder eine SKU.`;
  }
  return `\n\nوفي كمان ${count} منتجات — ابعت اسم أو رمز لو عايز تفاصيل واحد معيّن.`;
}

function productPrompt(language: CustomerReplyLanguage, key: string): string {
  const copy: Record<string, Record<CustomerReplyLanguage, string>> = {
    which: {
      ar: "أنهي منتج تقصد؟",
      en: "Which product do you mean?",
      de: "Welches Produkt meinen Sie?",
    },
    needTwo: {
      ar: "محتاج منتجين على الأقل عشان أقارن. ابعت الاسمين أو الرمزين.",
      en: "I need at least two products to compare. Send both names or SKUs.",
      de: "Zum Vergleich brauche ich mindestens zwei Produkte. Senden Sie beide Namen oder SKUs.",
    },
    whichPhoto: {
      ar: "أنهي منتج صوره؟",
      en: "Which product's photos should I send?",
      de: "Von welchem Produkt soll ich die Fotos senden?",
    },
    whichPrice: {
      ar: "أنهي منتج سعره؟",
      en: "Which product's price do you want?",
      de: "Von welchem Produkt möchten Sie den Preis?",
    },
    whichDetail: {
      ar: "اختار المنتج اللي تحب تعرف تفاصيله (ابعت الاسم أو الرمز):",
      en: "Pick the product you want details for (send the name or SKU):",
      de: "Wählen Sie das Produkt für Details (Name oder SKU):",
    },
    priceMissing: {
      ar: "مش لاقي المنتج ده. ابعت اسمه أو رمزه.",
      en: "I could not find that product. Send the name or SKU.",
      de: "Dieses Produkt habe ich nicht gefunden. Senden Sie den Namen oder die SKU.",
    },
    priceHeader: {
      ar: "أسعار المنتجات:",
      en: "Product prices:",
      de: "Produktpreise:",
    },
    noOther: {
      ar: "مفيش منتجات تانية غير اللي اتكلمنا عنهم. لو عايز تفاصيل منتج معيّن ابعت اسمه أو رمزه.",
      en: "There are no other products beyond the ones we already discussed. Send a name or SKU for a specific product.",
      de: "Es gibt keine weiteren Produkte außer den bereits besprochenen. Senden Sie einen Namen oder eine SKU.",
    },
    emptyCatalog: {
      ar: "مفيش منتجات في الكتالوج دلوقتي.",
      en: "The catalog has no products right now.",
      de: "Im Katalog sind derzeit keine Produkte.",
    },
    photoMissing: {
      ar: "مش لاقي المنتج ده عشان أبعت صوره. ابعت الاسم أو الرمز.",
      en: "I could not find that product to send photos. Send the name or SKU.",
      de: "Dieses Produkt habe ich für Fotos nicht gefunden. Senden Sie den Namen oder die SKU.",
    },
    notFound: {
      ar: "مش لاقي المنتج ده. ابعت الاسم أو الرمز.",
      en: "I could not find that product. Send the name or SKU.",
      de: "Dieses Produkt habe ich nicht gefunden. Senden Sie den Namen oder die SKU.",
    },
    loadFailed: {
      ar: "المعلومات تعذّر تحميلها دلوقتي، فمش هأكد سعر أو مواصفات.",
      en: "I could not load that information, so I can't confirm a price or specification.",
      de: "Die Informationen konnten nicht geladen werden, daher bestätige ich keinen Preis.",
    },
  };
  return copy[key]?.[language] ?? copy[key]?.ar ?? key;
}

/**
 * Official assistant fallback. Runs only after the model finished without calling
 * the catalog. Provider-selected search_products executions are left untouched.
 * A failed lookup replaces invented prose and never claims a product was found.
 */
async function groundDeferredCatalogAnswer(
  tools: RuntimeToolPort,
  input: ToolCallLoopInput,
  response: RuntimeGatewayChatResponse,
  toolExecutions: ToolCallLoopResult["toolExecutions"],
  sourceMessages: RuntimeGatewayChatRequest["messages"],
): Promise<RuntimeGatewayChatResponse> {
  if (!input.deferDeterministicSales) return response;
  if (!input.allowedToolKeys.includes("search_products")) return response;
  if (
    toolExecutions.some(
      (execution) => execution.toolKey === "search_products" || execution.toolKey === "get_product_details",
    )
  ) {
    return response;
  }
  const latest = latestUserTextFromMessages(sourceMessages);
  const salesAction =
    /\b(?:quote|quotation|angebot|kostenvoranschlag)\b|عرض\s*سعر|book(?:\s+a)?\s+(?:product\s+)?demo|\bdemo\s+booking\b|demo\s+buchen|eine\s+demo/iu.test(
      latest,
    );
  const productAsk =
    looksLikeProductQuestion(latest) ||
    looksLikeCurrentCatalogFactQuestion(latest) ||
    looksLikeProductDetailQuestion(latest, sourceMessages);
  if (!productAsk || salesAction) return response;

  const language = detectCustomerLanguage(latest) ?? "en";
  const query = productQueryFromText(latest) || latest.trim();
  try {
    const routed = await tools.route(input.ctx, {
      conversationId: input.conversationId,
      toolKey: "search_products",
      input: { query, limit: 5 },
      triggeredBy: "agent",
    });
    const output = (
      routed.output ? omitProductDeliveryImages(routed.output) : null
    ) as Record<string, unknown> | null;
    const groundedOutput = {
      ...(output ?? {}),
      catalogGrounding: "application_fallback",
      providerSelected: false,
    };
    toolExecutions.push({
      toolKey: routed.toolKey,
      executionId: routed.executionId,
      status: routed.status,
      input: { query, limit: 5 },
      output: groundedOutput,
      durationMs: routed.durationMs,
    });
    if (routed.status !== "succeeded") {
      return { ...response, text: productPrompt(language, "loadFailed"), finishReason: "stop" };
    }
    const products = (Array.isArray(output?.products) ? output.products : [])
      .map(productRecord)
      .filter((record): record is Record<string, unknown> => Boolean(record));
    if (products.length === 1) {
      return {
        ...response,
        text: formatProductDetail(products[0], { includePrice: true, language }),
        finishReason: "stop",
      };
    }
    if (products.length > 1) {
      const lines = products.slice(0, 5).map((record) => formatProductLine(record)).filter(Boolean);
      const ask =
        language === "ar"
          ? "لقيتهم في الكتالوج. تحب تفاصيل أنهي منتج؟"
          : language === "de"
            ? "Diese Produkte stehen im Katalog. Welches soll ich beschreiben?"
            : "These are in the catalog. Which product should I describe?";
      return { ...response, text: [ask, ...lines].join("\n"), finishReason: "stop" };
    }
    return { ...response, text: productPrompt(language, "notFound"), finishReason: "stop" };
  } catch {
    return { ...response, text: productPrompt(language, "loadFailed"), finishReason: "stop" };
  }
}

export class ToolCallLoopService {
  constructor(
    private readonly deps: {
      gateway: RuntimeGatewayPort;
      tools?: RuntimeToolPort;
    },
  ) {}

  async run(input: ToolCallLoopInput): Promise<ToolCallLoopResult> {
    const humanReply = await replyToHumanRequest(input, this.deps.tools);
    if (humanReply) return humanReply;
    const complaintReply = unsupportedComplaintReply(input, this.deps.tools);
    if (complaintReply) return stoppedLoopResult(input, complaintReply);
    const helpReply = capabilitiesReply(input, this.deps.tools);
    if (helpReply) return stoppedLoopResult(input, helpReply);
    const contactReply = companyContactReply(input.gatewayRequest.messages);
    if (contactReply) {
      return {
        response: {
          text: contactReply,
          model: input.gatewayRequest.model ?? "unknown",
          providerKey: input.gatewayRequest.providerKey ?? "unknown",
          finishReason: "stop",
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          latencyMs: 0,
        },
        messages: [...input.gatewayRequest.messages],
        toolExecutions: [],
      };
    }
    // Tool port present ⇒ run deterministic product/scheduling handlers even when the
    // gateway tool list is empty (misconfigured employee). Empty tools alone must not
    // skip catalog answers and let the LLM invent "can't show products / here's services".
    if (!this.deps.tools) {
      const raw = await this.deps.gateway.chatCompletion({
        ...input.gatewayRequest,
        tools: undefined,
      });
      const guarded = reconcileUnverifiedCustomerClaims(raw.text, []);
      const response = guarded.adjusted ? { ...raw, text: guarded.text } : raw;
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

      let customerBookingsText: string | null = null;
      try {
        customerBookingsText = await customerBookingsReply({
          tools: this.deps.tools,
          ctx: input.ctx,
          conversationId: input.conversationId,
          allowedToolKeys: input.allowedToolKeys,
          sourceMessages,
          toolExecutions,
          trustedCustomerId,
        });
      } catch {
        // Never fail the turn because the customer bookings lookup threw.
      }
      if (customerBookingsText) {
        return {
          response: {
            text: customerBookingsText,
            model: input.gatewayRequest.model ?? "unknown",
            providerKey: input.gatewayRequest.providerKey ?? "unknown",
            finishReason: "stop",
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            latencyMs: 0,
          },
          messages,
          toolExecutions,
        };
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

      // Reschedule guidance or result must answer now — do not wait on find-next / availability.
      const earlyRescheduleAfterForce = [...toolExecutions]
        .reverse()
        .find((execution) => execution.toolKey === "reschedule_booking");
      if (earlyRescheduleAfterForce) {
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
          sourceMessages,
        );
        if (earlyResponse.text.trim()) {
          return { response: earlyResponse, messages, toolExecutions };
        }
        const guarded = applyRescheduleTopicGuard(
          {
            text: "",
            model: input.gatewayRequest.model ?? "unknown",
            providerKey: input.gatewayRequest.providerKey ?? "unknown",
            finishReason: "stop",
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            latencyMs: 0,
          },
          sourceMessages,
          toolExecutions,
        );
        if (guarded.text.trim()) {
          return { response: guarded, messages, toolExecutions };
        }
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
          trustedCustomerId,
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
          sourceMessages,
        );
        if (earlyResponse.text.trim()) {
          return { response: earlyResponse, messages, toolExecutions };
        }
      }

      const latestCustomerText = latestUserTextFromMessages(sourceMessages);

      if (this.deps.tools && latestCustomerText.trim() && !input.deferDeterministicSales) {
        try {
          const salesText = await trySalesConversationTurn({
            text: latestCustomerText,
            allowedToolKeys: input.allowedToolKeys,
            route: async (toolKey, toolInput) => {
              try {
                const routed = await this.deps.tools!.route(input.ctx, {
                  conversationId: input.conversationId,
                  toolKey,
                  input: toolInput,
                  triggeredBy: "agent",
                });
                toolExecutions.push({
                  toolKey: routed.toolKey,
                  executionId: routed.executionId,
                  status: routed.status,
                  output: routed.output,
                  durationMs: routed.durationMs,
                });
                return {
                  status: routed.status,
                  output: routed.output,
                  errorMessage: routed.errorMessage,
                };
              } catch {
                return { status: "failed", output: null, errorMessage: "failed" };
              }
            },
          });
          if (salesText) {
            return {
              response: {
                text: salesText,
                model: input.gatewayRequest.model ?? "unknown",
                providerKey: input.gatewayRequest.providerKey ?? "unknown",
                finishReason: "stop",
                usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                latencyMs: 0,
              },
              messages,
              toolExecutions,
            };
          }
        } catch {
          // A sales-turn failure must not invent a booking or a sent quote.
        }
      }

      // Ticket comment/update before catalog/LLM — never let the model invent product cards.
      if (customerWantsAddTicketComment(sourceMessages) || customerWantsChangeTicketFields(sourceMessages)) {
        try {
          await forceSearchTicketIfNeeded({
            tools: this.deps.tools,
            ctx: input.ctx,
            conversationId: input.conversationId,
            allowedToolKeys: input.allowedToolKeys,
            sourceMessages,
            toolExecutions,
          });
        } catch {
          // Never fail the turn because forced ticket search threw.
        }
        try {
          await forceAddTicketCommentIfReady({
            tools: this.deps.tools,
            ctx: input.ctx,
            conversationId: input.conversationId,
            allowedToolKeys: input.allowedToolKeys,
            sourceMessages,
            toolExecutions,
          });
        } catch {
          // Never fail the turn because forced ticket comment threw.
        }
        try {
          await forceChangeTicketFieldsIfReady({
            tools: this.deps.tools,
            ctx: input.ctx,
            conversationId: input.conversationId,
            allowedToolKeys: input.allowedToolKeys,
            sourceMessages,
            toolExecutions,
          });
        } catch {
          // Never fail the turn because forced ticket field change threw.
        }
        const ticketGuidance = [...toolExecutions]
          .reverse()
          .find((execution) => {
            const facing =
              typeof execution.output?.customerFacingMessage === "string"
                ? execution.output.customerFacingMessage.trim()
                : "";
            if (!facing) return false;
            return (
              execution.toolKey === "add_ticket_comment" ||
              execution.toolKey === "change_ticket_status" ||
              execution.toolKey === "change_ticket_priority" ||
              execution.toolKey === "search_ticket"
            );
          });
        if (ticketGuidance?.output?.customerFacingMessage) {
          return {
            response: {
              text: String(ticketGuidance.output.customerFacingMessage).trim(),
              model: input.gatewayRequest.model ?? "unknown",
              providerKey: input.gatewayRequest.providerKey ?? "unknown",
              finishReason: "stop",
              usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
              latencyMs: 0,
            },
            messages,
            toolExecutions,
          };
        }
        // Only surface a ticket list during comment/update when the customer explicitly asked to browse.
        if (
          customerWantsAddTicketComment(sourceMessages) &&
          customerWantsTicketList(sourceMessages)
        ) {
          const listReply = applyTicketSearchReplyFallback(
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
          const mutationFacing = applyTicketMutationReplyFallback(listReply, toolExecutions);
          if (mutationFacing.text.trim()) {
            return { response: mutationFacing, messages, toolExecutions };
          }
          if (listReply.text.trim()) {
            return { response: listReply, messages, toolExecutions };
          }
        }
      }

      if (looksLikeCompanyPolicyQuestion(latestCustomerText)) {
        return {
          response: {
            text: companyPolicyReply(sourceMessages),
            model: input.gatewayRequest.model ?? "unknown",
            providerKey: input.gatewayRequest.providerKey ?? "unknown",
            finishReason: "stop",
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            latencyMs: 0,
          },
          messages,
          toolExecutions,
        };
      }
      if (looksLikeCompanyIntroQuestion(latestCustomerText)) {
        const aboutCompany =
          /(?:شركه|شركة|شركتكم|شركتك|العياده|العيادة|company)/iu.test(latestCustomerText) &&
          !/(?:خدماتكم|خدمتكم|خدماتنا|خدمتنا|\bservices\b)/iu.test(latestCustomerText);
        return {
          response: {
            text: aboutCompany
              ? companyAboutReply(sourceMessages)
              : companyServicesAboutReply(sourceMessages),
            model: input.gatewayRequest.model ?? "unknown",
            providerKey: input.gatewayRequest.providerKey ?? "unknown",
            finishReason: "stop",
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            latencyMs: 0,
          },
          messages,
          toolExecutions,
        };
      }
      const replyLanguage = customerReplyLanguage(sourceMessages);
      const productToolsOffered =
        input.allowedToolKeys.includes("search_products") ||
        (typeof this.deps.tools?.allowedToolKeys === "function" &&
          this.deps.tools.allowedToolKeys().includes("search_products"));
      const productTypeIntent = detectProductTypeIntent(latestCustomerText);
      const wantsProductPhoto = looksLikeProductPhotoQuestion(latestCustomerText);
      const wantsMultiProductDetail = looksLikeMultiProductDetailQuestion(latestCustomerText);
      const wantsMultiProductPrice = looksLikeMultiProductPriceQuestion(latestCustomerText);
      const wantsProductCatalogIntro = looksLikeProductCatalogIntroQuestion(latestCustomerText);
      const wantsCompare = looksLikeProductCompareQuestion(latestCustomerText);
      const wantsUnsupportedFact = looksLikeUnsupportedProductFactQuestion(latestCustomerText);
      const wantsTaxInclusion = looksLikeProductTaxInclusionQuestion(latestCustomerText);
      const wantsCatalogBatch = wantsMultiProductDetail || wantsMultiProductPrice;
      const wantsProductDetail =
        looksLikeProductDetailQuestion(latestCustomerText, sourceMessages) || wantsMultiProductDetail;
      const wantsProductPrice =
        looksLikeCatalogProductPriceQuestion(latestCustomerText, sourceMessages) || wantsMultiProductPrice;
      const wantsSingleProduct =
        !wantsCatalogBatch &&
        !wantsProductCatalogIntro &&
        !wantsCompare &&
        (wantsProductDetail ||
          wantsProductPrice ||
          wantsProductPhoto ||
          wantsUnsupportedFact ||
          wantsTaxInclusion);
      const explicitProductQuestion =
        looksLikeCurrentCatalogFactQuestion(latestCustomerText) ||
        looksLikeProductQuestion(latestCustomerText) ||
        wantsSingleProduct ||
        wantsCatalogBatch ||
        wantsProductCatalogIntro ||
        wantsCompare ||
        wantsUnsupportedFact ||
        wantsTaxInclusion;
      let productQuery =
        wantsCatalogBatch || wantsProductCatalogIntro
          ? ""
          : productQueryFromText(latestCustomerText, productTypeIntent);
      const offeredProducts = lastOfferedCatalogProducts(sourceMessages);
      const catalogHistory = offeredCatalogHistory(sourceMessages);
      const serviceMenuQuestion =
        /(?:الخدمات|خدمات|\bservices\b)/iu.test(latestCustomerText) &&
        !/(?:منتج|المنتج|سعر|price)/iu.test(latestCustomerText);
      const bareCatalogFollowUp =
        !productQuery &&
        !serviceMenuQuestion &&
        !wantsCatalogBatch &&
        !wantsProductCatalogIntro &&
        (wantsProductPrice ||
          wantsProductDetail ||
          looksLikeCurrentCatalogFactQuestion(latestCustomerText));
      if (
        bareCatalogFollowUp &&
        !looksLikePreviousProductRef(latestCustomerText) &&
        !catalogListOrdinal(latestCustomerText)
      ) {
        const labels = priorCatalogProductLabels(sourceMessages);
        if (labels.length === 1) {
          productQuery = labels[0]!;
        } else if (labels.length > 1 || (offeredProducts.length === 0 && catalogHistory.length === 0)) {
          return {
            response: {
              text: catalogFollowUpAsk(replyLanguage, labels),
              model: input.gatewayRequest.model ?? "unknown",
              providerKey: input.gatewayRequest.providerKey ?? "unknown",
              finishReason: "stop",
              usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
              latencyMs: 0,
            },
            messages,
            toolExecutions,
          };
        }
      }
      if (looksLikePreviousProductRef(latestCustomerText) && catalogHistory.length > 1 && !productQuery) {
        return {
          response: {
            text: [
              productPrompt(replyLanguage, "which"),
              ...catalogHistory.slice(0, PRODUCT_LIST_LIMIT).map((item) => `- ${formatOfferedCatalogLine(item)}`),
            ].join("\n"),
            model: input.gatewayRequest.model ?? "unknown",
            providerKey: input.gatewayRequest.providerKey ?? "unknown",
            finishReason: "stop",
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            latencyMs: 0,
          },
          messages,
          toolExecutions,
        };
      }
      const ordinal = wantsCompare ? null : catalogListOrdinal(latestCustomerText);
      if (ordinal && productToolsOffered && !productQuery) {
        const list = offeredProducts.length >= 2 ? offeredProducts : catalogHistory;
        const index = ordinal === "first" ? 0 : ordinal === "second" ? 1 : Math.max(0, list.length - 1);
        const picked = list.length >= 2 ? list[index] : undefined;
        if (!picked) {
          const shown = (list.length > 0 ? list : catalogHistory).slice(0, PRODUCT_LIST_LIMIT);
          return {
            response: {
              text:
                shown.length > 0
                  ? [
                      productPrompt(replyLanguage, "which"),
                      ...shown.map((item) => `- ${formatOfferedCatalogLine(item)}`),
                    ].join("\n")
                  : productPrompt(replyLanguage, "notFound"),
              model: input.gatewayRequest.model ?? "unknown",
              providerKey: input.gatewayRequest.providerKey ?? "unknown",
              finishReason: "stop",
              usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
              latencyMs: 0,
            },
            messages,
            toolExecutions,
          };
        }
        productQuery = picked.sku || picked.name;
      }
      if (!productQuery && wantsSingleProduct && offeredProducts.length === 1) {
        productQuery = offeredProducts[0]!.sku || offeredProducts[0]!.name;
      }
      if (!productQuery && wantsSingleProduct && catalogHistory.length === 1) {
        productQuery = catalogHistory[0]!.sku || catalogHistory[0]!.name;
      }
      if (!productQuery && wantsSingleProduct && offeredProducts.length > 1) {
        const sticky = matchOfferedProductFromRecentUserTurns(sourceMessages, offeredProducts);
        if (sticky) productQuery = sticky.sku || sticky.name;
      }
      if (!productQuery && wantsSingleProduct && catalogHistory.length > 1) {
        const sticky = matchOfferedProductFromRecentUserTurns(sourceMessages, catalogHistory);
        if (sticky) productQuery = sticky.sku || sticky.name;
      }
      const productWords = productQuery.split(/\s+/).filter(Boolean);
      const ticketTurn = customerWantsAnyTicketFlow(sourceMessages);
      const recommendationTurn =
        productToolsOffered &&
        looksLikeProductRecommendationTurn(latestCustomerText) &&
        !wantsProductPrice &&
        !wantsProductPhoto &&
        !wantsProductDetail &&
        !wantsCompare &&
        !wantsProductCatalogIntro &&
        !wantsTaxInclusion &&
        !wantsUnsupportedFact;
      if (customerOptedOutOfRecommendations(latestCustomerText) && productToolsOffered && this.deps.tools) {
        const decision = recommendFromCatalog({
          messages: sourceMessages
            .filter((message) => message.role === "user")
            .map((message) => ({ role: "customer" as const, text: String(message.content ?? "") })),
          products: [],
          showPrices: false,
        });
        return {
          response: {
            text: decision.customerText,
            model: input.gatewayRequest.model ?? "unknown",
            providerKey: input.gatewayRequest.providerKey ?? "unknown",
            finishReason: "stop",
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            latencyMs: 0,
          },
          messages,
          toolExecutions,
        };
      }
      // Explicit product-catalog ask without catalog tools: never fall through to the LLM
      // inventing "can't show products / here are scheduling services". Pure "خدمات"
      // scheduling questions still reach serviceCatalogReply below.
      const hardProductCatalogAsk =
        wantsProductCatalogIntro ||
        /(?:المنتجات|منتجاتكم|منتجاتنا|منتجاتك|منتجاتكو|منتجات|كتالوج|products?\b)/iu.test(
          latestCustomerText,
        );
      if (
        hardProductCatalogAsk &&
        !productToolsOffered &&
        !input.deferDeterministicSales &&
        !ticketTurn &&
        !/(?:احجز|أحجز|حجز)/u.test(latestCustomerText)
      ) {
        return {
          response: {
            text: productPrompt(replyLanguage, "loadFailed"),
            model: input.gatewayRequest.model ?? "unknown",
            providerKey: input.gatewayRequest.providerKey ?? "unknown",
            finishReason: "stop",
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            latencyMs: 0,
          },
          messages,
          toolExecutions,
        };
      }
      const tryProductLookup =
        !input.deferDeterministicSales &&
        productToolsOffered &&
        this.deps.tools &&
        !looksLikeCasualReply(latestCustomerText) &&
        !/(?:احجز|أحجز|حجز)/u.test(latestCustomerText) &&
        !ticketTurn &&
        (recommendationTurn || explicitProductQuestion || (productWords.length > 0 && productWords.length <= 8));
      if (tryProductLookup && this.deps.tools) {
        try {
          const searchProducts = async (
            query: string,
            productType: ProductTypeChatCode | null,
            limit: number,
          ) => {
            const routed = await this.deps.tools!.route(input.ctx, {
              conversationId: input.conversationId,
              toolKey: "search_products",
              input: {
                query,
                limit,
                ...(productType ? { productType } : {}),
                ...(recommendationTurn
                  ? {
                      conversationTexts: sourceMessages
                        .filter((message) => message.role === "user")
                        .map((message) => String(message.content ?? ""))
                        .filter((text) => text.trim().length > 0)
                        .slice(-8),
                    }
                  : {}),
              },
              triggeredBy: "agent",
            });
            // Channel side-channel sends deliveryImages whenever present — keep only on photo asks.
            const rawOutput = routed.output ?? null;
            const output = (
              wantsProductPhoto
                ? rawOutput
                : (omitProductDeliveryImages(rawOutput) as Record<string, unknown> | null)
            ) as Record<string, unknown> | null;
            const mapped = (Array.isArray(output?.products) ? output.products : [])
              .map(productRecord)
              .filter((record): record is Record<string, unknown> => Boolean(record));
            const typed = mapped.filter(
              (record) => !productType || productText(record, "productType") === productType,
            );
            const queryKey = (query.trim() || latestCustomerText).toLowerCase();
            const identityHits =
              typed.length > 0 || queryKey.length === 0
                ? []
                : mapped.filter((record) => {
                    const sku = productText(record, "sku").trim().toLowerCase();
                    const name = productText(record, "name").trim().toLowerCase();
                    return (
                      (sku.length >= 3 && queryKey.includes(sku)) ||
                      (name.length >= 8 && queryKey.includes(name))
                    );
                  });
            // A named SKU must not disappear because a nearby word such as "خدمات" set another type.
            const products = typed.length > 0 ? typed : identityHits;
            return {
              routed: { ...routed, output },
              output,
              products,
            };
          };
          const browseLimit = recommendationTurn
            ? PRODUCT_LIST_LIMIT
            : wantsCatalogBatch || (!wantsSingleProduct && productWords.length === 0)
              ? PRODUCT_LIST_LIMIT
              : wantsSingleProduct || productWords.length > 0
                ? PRODUCT_LOOKUP_LIMIT
                : PRODUCT_LIST_LIMIT;
          let { routed, output, products } = await searchProducts(
            productQuery,
            productTypeIntent,
            browseLimit,
          );
          // Listing questions with leftover filler ("اللي") must not fail as a specific search.
          let specificLookup = productWords.length > 0;
          if (explicitProductQuestion && specificLookup && products.length === 0 && !wantsSingleProduct) {
            ({ routed, output, products } = await searchProducts("", productTypeIntent, PRODUCT_LIST_LIMIT));
            specificLookup = false;
          }
          let keepFoundProducts = false;
          if (recommendationTurn) {
            const recommendation =
              output?.recommendation && typeof output.recommendation === "object"
                ? (output.recommendation as { action?: unknown; customerText?: unknown })
                : null;
            const action = typeof recommendation?.action === "string" ? recommendation.action : "";
            const customerText = typeof recommendation?.customerText === "string" ? recommendation.customerText : "";
            // A non-empty catalog hit must not be replaced by a no-match or conflict sentence.
            keepFoundProducts =
              products.length > 0 && (action === "no_match" || action === "contradictory");
            if (customerText && !keepFoundProducts) {
              toolExecutions.push({
                toolKey: routed.toolKey,
                executionId: routed.executionId,
                status: routed.status,
                output: routed.output,
                durationMs: routed.durationMs,
              });
              return {
                response: {
                  text: customerText,
                  model: input.gatewayRequest.model ?? "unknown",
                  providerKey: input.gatewayRequest.providerKey ?? "unknown",
                  finishReason: "stop",
                  usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                  latencyMs: 0,
                },
                messages,
                toolExecutions,
              };
            }
          }
          if (
            products.length === 0 &&
            wantsSingleProduct &&
            offeredProducts.length > 1 &&
            !productQuery
          ) {
            return {
              response: {
                text: [
                  productPrompt(replyLanguage, "which"),
                  ...offeredProducts.slice(0, PRODUCT_LIST_LIMIT).map((item) => `- ${formatOfferedCatalogLine(item)}`),
                ].join("\n"),
                model: input.gatewayRequest.model ?? "unknown",
                providerKey: input.gatewayRequest.providerKey ?? "unknown",
                finishReason: "stop",
                usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                latencyMs: 0,
              },
              messages,
              toolExecutions,
            };
          }
          const matched =
            explicitProductQuestion || keepFoundProducts
              ? products
              : products.filter((record) => productMatchesTerms(record, productWords, productTypeIntent));
          if (explicitProductQuestion || matched.length > 0) {
            toolExecutions.push({
              toolKey: routed.toolKey,
              executionId: routed.executionId,
              status: routed.status,
              output: routed.output,
              durationMs: routed.durationMs,
            });
            let facingProducts = explicitProductQuestion ? products : matched;

            if (wantsSingleProduct && facingProducts.length > 1 && productQuery) {
              const key = arabicWordKey(productQuery);
              const exact = facingProducts.filter((record) => {
                const name = arabicWordKey(productText(record, "name"));
                const sku = arabicWordKey(productText(record, "sku"));
                return name.includes(key) || sku.includes(key) || key.includes(sku);
              });
              if (exact.length > 0) facingProducts = exact;
            }

            if (
              facingProducts.length === 1 &&
              !wantsCompare &&
              !wantsProductDetail &&
              !wantsProductPhoto &&
              (wantsProductPrice || looksLikeCurrentCatalogFactQuestion(latestCustomerText))
            ) {
              const trustedProductId = productText(facingProducts[0]!, "productId");
              const canDetails =
                input.allowedToolKeys.includes("get_product_details") ||
                (typeof this.deps.tools.allowedToolKeys === "function" &&
                  this.deps.tools.allowedToolKeys().includes("get_product_details"));
              if (canDetails && trustedProductId) {
                try {
                  const detailed = await this.deps.tools.route(input.ctx, {
                    conversationId: input.conversationId,
                    toolKey: "get_product_details",
                    input: { productIds: [trustedProductId] },
                    triggeredBy: "agent",
                  });
                  const detailOutput = wantsProductPhoto
                    ? detailed.output
                    : (omitProductDeliveryImages(detailed.output) as Record<string, unknown> | null);
                  toolExecutions.push({
                    toolKey: detailed.toolKey,
                    executionId: detailed.executionId,
                    status: detailed.status,
                    output: detailOutput,
                    durationMs: detailed.durationMs,
                  });
                  const detailedProducts = Array.isArray(
                    detailOutput && typeof detailOutput === "object"
                      ? (detailOutput as { products?: unknown }).products
                      : null,
                  )
                    ? (detailOutput as { products: unknown[] }).products
                    : [];
                  const trusted = productRecord(
                    detailedProducts.find((item) => {
                      const record = productRecord(item);
                      return record ? productText(record, "productId") === trustedProductId : false;
                    }) ?? detailedProducts[0],
                  );
                  if (trusted && productText(trusted, "productId") === trustedProductId) {
                    facingProducts = [trusted];
                  }
                } catch {
                  // Keep the search row when the id lookup cannot be loaded.
                }
              }
            }

            if (wantsCompare) {
              if (facingProducts.length < 2) {
                return {
                  response: {
                    text: productPrompt(replyLanguage, "needTwo"),
                    model: input.gatewayRequest.model ?? "unknown",
                    providerKey: input.gatewayRequest.providerKey ?? "unknown",
                    finishReason: "stop",
                    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                    latencyMs: 0,
                  },
                  messages,
                  toolExecutions,
                };
              }
              if (wantsProductPhoto) {
                return {
                  response: {
                    text: [
                      productPrompt(replyLanguage, "whichPhoto"),
                      ...facingProducts.slice(0, PRODUCT_LIST_LIMIT).map((record) => `- ${formatProductLine(record)}`),
                    ].join("\n"),
                    model: input.gatewayRequest.model ?? "unknown",
                    providerKey: input.gatewayRequest.providerKey ?? "unknown",
                    finishReason: "stop",
                    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                    latencyMs: 0,
                  },
                  messages,
                  toolExecutions,
                };
              }
              const cards = facingProducts
                .slice(0, PRODUCT_DETAILS_MAX_IDS)
                .map((record) =>
                  formatProductDetail(record, { includePrice: wantsProductPrice, language: replyLanguage }),
                );
              const note = unsupportedProductFactNote(latestCustomerText, replyLanguage);
              return {
                response: {
                  text: [...cards, note].filter(Boolean).join("\n\n"),
                  model: input.gatewayRequest.model ?? "unknown",
                  providerKey: input.gatewayRequest.providerKey ?? "unknown",
                  finishReason: "stop",
                  usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                  latencyMs: 0,
                },
                messages,
                toolExecutions,
              };
            }

            if (wantsProductPrice && !wantsProductPhoto && !wantsProductDetail) {
              if (facingProducts.length === 0) {
                return {
                  response: {
                    text: productPrompt(replyLanguage, "priceMissing"),
                    model: input.gatewayRequest.model ?? "unknown",
                    providerKey: input.gatewayRequest.providerKey ?? "unknown",
                    finishReason: "stop",
                    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                    latencyMs: 0,
                  },
                  messages,
                  toolExecutions,
                };
              }
              if (wantsMultiProductPrice) {
                const lines = facingProducts
                  .slice(0, PRODUCT_LIST_LIMIT)
                  .map((record) => `- ${formatProductPriceOnly(record, replyLanguage)}`);
                const note = unsupportedProductFactNote(latestCustomerText, replyLanguage);
                return {
                  response: {
                    text: [productPrompt(replyLanguage, "priceHeader"), ...lines, note].filter(Boolean).join("\n"),
                    model: input.gatewayRequest.model ?? "unknown",
                    providerKey: input.gatewayRequest.providerKey ?? "unknown",
                    finishReason: "stop",
                    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                    latencyMs: 0,
                  },
                  messages,
                  toolExecutions,
                };
              }
              if (facingProducts.length > 1) {
                return {
                  response: {
                    text: [
                      productPrompt(replyLanguage, "whichPrice"),
                      ...facingProducts.slice(0, PRODUCT_LIST_LIMIT).map((record) => `- ${formatProductLine(record)}`),
                    ].join("\n"),
                    model: input.gatewayRequest.model ?? "unknown",
                    providerKey: input.gatewayRequest.providerKey ?? "unknown",
                    finishReason: "stop",
                    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                    latencyMs: 0,
                  },
                  messages,
                  toolExecutions,
                };
              }
              const note = unsupportedProductFactNote(latestCustomerText, replyLanguage);
              // Tax inclusion is already folded into formatProductPriceOnly when an amount exists.
              return {
                response: {
                  text: [formatProductPriceOnly(facingProducts[0]!, replyLanguage), note]
                    .filter(Boolean)
                    .join("\n\n"),
                  model: input.gatewayRequest.model ?? "unknown",
                  providerKey: input.gatewayRequest.providerKey ?? "unknown",
                  finishReason: "stop",
                  usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                  latencyMs: 0,
                },
                messages,
                toolExecutions,
              };
            }

            if (wantsMultiProductDetail) {
              let batch = facingProducts;
              const excludeRemaining =
                /(?:باقي|باقى|بقية|التاني|التانية|الاخرى|الأخرى|other|remaining|rest)/iu.test(
                  latestCustomerText,
                );
              // Only drop the single product we just discussed — not a full catalog list.
              if (excludeRemaining && offeredProducts.length === 1) {
                const skipSku = arabicWordKey(offeredProducts[0]!.sku);
                const skipName = arabicWordKey(offeredProducts[0]!.name);
                batch = facingProducts.filter((record) => {
                  const sku = arabicWordKey(productText(record, "sku"));
                  const name = arabicWordKey(productText(record, "name"));
                  return sku !== skipSku && name !== skipName;
                });
              }
              if (batch.length === 0) {
                return {
                  response: {
                    text:
                      facingProducts.length > 0
                        ? productPrompt(replyLanguage, "noOther")
                        : productPrompt(replyLanguage, "emptyCatalog"),
                    model: input.gatewayRequest.model ?? "unknown",
                    providerKey: input.gatewayRequest.providerKey ?? "unknown",
                    finishReason: "stop",
                    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                    latencyMs: 0,
                  },
                  messages,
                  toolExecutions,
                };
              }
              // WhatsApp has little room — list titles first; dump full cards only after they pick one.
              const listed = batch.slice(0, PRODUCT_LIST_LIMIT);
              const more =
                batch.length > PRODUCT_LIST_LIMIT
                  ? moreProductDetails(batch.length - PRODUCT_LIST_LIMIT, replyLanguage)
                  : "";
              return {
                response: {
                  text: [
                    productPrompt(replyLanguage, "whichDetail"),
                    ...listed.map((record) => `- ${formatProductLine(record)}`),
                    more,
                  ]
                    .filter(Boolean)
                    .join("\n"),
                  model: input.gatewayRequest.model ?? "unknown",
                  providerKey: input.gatewayRequest.providerKey ?? "unknown",
                  finishReason: "stop",
                  usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                  latencyMs: 0,
                },
                messages,
                toolExecutions,
              };
            }

            if (
              wantsProductDetail ||
              wantsProductPhoto ||
              wantsUnsupportedFact ||
              wantsTaxInclusion ||
              (wantsProductPrice && wantsProductPhoto)
            ) {
              if (facingProducts.length === 0) {
                return {
                  response: {
                    text: wantsProductPhoto
                      ? productPrompt(replyLanguage, "photoMissing")
                      : productPrompt(replyLanguage, "notFound"),
                    model: input.gatewayRequest.model ?? "unknown",
                    providerKey: input.gatewayRequest.providerKey ?? "unknown",
                    finishReason: "stop",
                    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                    latencyMs: 0,
                  },
                  messages,
                  toolExecutions,
                };
              }
              if (facingProducts.length > 1) {
                return {
                  response: {
                    text: [
                      productPrompt(replyLanguage, wantsProductPhoto ? "whichPhoto" : "whichDetail"),
                      ...facingProducts.slice(0, PRODUCT_LIST_LIMIT).map((record) => `- ${formatProductLine(record)}`),
                    ].join("\n"),
                    model: input.gatewayRequest.model ?? "unknown",
                    providerKey: input.gatewayRequest.providerKey ?? "unknown",
                    finishReason: "stop",
                    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                    latencyMs: 0,
                  },
                  messages,
                  toolExecutions,
                };
              }
              let detail = facingProducts[0]!;
              const productId = productText(detail, "productId");
              const canDetails =
                input.allowedToolKeys.includes("get_product_details") ||
                (typeof this.deps.tools.allowedToolKeys === "function" &&
                  this.deps.tools.allowedToolKeys().includes("get_product_details"));
              if (canDetails && productId) {
                try {
                  const detailed = await this.deps.tools.route(input.ctx, {
                    conversationId: input.conversationId,
                    toolKey: "get_product_details",
                    input: { productIds: [productId] },
                    triggeredBy: "agent",
                  });
                  const detailOutput = wantsProductPhoto
                    ? detailed.output
                    : omitProductDeliveryImages(detailed.output);
                  toolExecutions.push({
                    toolKey: detailed.toolKey,
                    executionId: detailed.executionId,
                    status: detailed.status,
                    output: detailOutput,
                    durationMs: detailed.durationMs,
                  });
                  const detailedProducts = Array.isArray(
                    detailOutput && typeof detailOutput === "object"
                      ? (detailOutput as { products?: unknown }).products
                      : null,
                  )
                    ? (detailOutput as { products: unknown[] }).products
                    : [];
                  const first = productRecord(detailedProducts[0]);
                  if (first) {
                    detail = first;
                    // Photo delivery side-channel lives on the tool envelope, not each product row.
                    if (
                      wantsProductPhoto &&
                      detailOutput &&
                      typeof detailOutput === "object" &&
                      Array.isArray((detailOutput as { deliveryImages?: unknown }).deliveryImages) &&
                      (detailOutput as { deliveryImages: unknown[] }).deliveryImages.length > 0
                    ) {
                      detail = {
                        ...detail,
                        imageCount: (detailOutput as { deliveryImages: unknown[] }).deliveryImages
                          .length,
                        deliveryImages: (detailOutput as { deliveryImages: unknown[] })
                          .deliveryImages,
                      };
                    }
                  }
                } catch {
                  // Fall back to the search summary fields.
                }
              }
              const parts: string[] = [];
              if (wantsProductDetail) {
                parts.push(
                  formatProductDetail(detail, {
                    includePrice: wantsProductPrice,
                    language: replyLanguage,
                  }),
                );
              } else if (wantsProductPrice) {
                parts.push(formatProductPriceOnly(detail, replyLanguage));
              }
              // Tax-only ask (no price/detail card): answer inclusion alone. With price, tax is already on the price block.
              if (wantsTaxInclusion && !wantsProductDetail && !wantsProductPrice) {
                parts.push(formatProductTaxInclusion(detail, { language: replyLanguage }));
              }
              if (wantsProductPhoto) parts.push(formatProductPhotoReply(detail, replyLanguage));
              const note = unsupportedProductFactNote(latestCustomerText, replyLanguage);
              if (note) parts.push(note);
              return {
                response: {
                  text:
                    parts.join("\n\n") ||
                    formatProductDetail(detail, { includePrice: false, language: replyLanguage }),
                  model: input.gatewayRequest.model ?? "unknown",
                  providerKey: input.gatewayRequest.providerKey ?? "unknown",
                  finishReason: "stop",
                  usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                  latencyMs: 0,
                },
                messages,
                toolExecutions,
              };
            }

            const facing = formatProductFacing(
              { ...(output ?? {}), products: facingProducts },
              explicitProductQuestion ? specificLookup : true,
              productTypeIntent,
              replyLanguage,
            );
            return {
              response: {
                text: facing,
                model: input.gatewayRequest.model ?? "unknown",
                providerKey: input.gatewayRequest.providerKey ?? "unknown",
                finishReason: "stop",
                usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                latencyMs: 0,
              },
              messages,
              toolExecutions,
            };
          }
        } catch {
          if (explicitProductQuestion) {
            return {
              response: {
                text: productPrompt(replyLanguage, "loadFailed"),
                model: input.gatewayRequest.model ?? "unknown",
                providerKey: input.gatewayRequest.providerKey ?? "unknown",
                finishReason: "stop",
                usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                latencyMs: 0,
              },
              messages,
              toolExecutions,
            };
          }
        }
      }
      const bookingSetup = bookingSetupReply(sourceMessages);
      if (bookingSetup && "text" in bookingSetup) {
        return {
          response: {
            text: bookingSetup.text,
            model: input.gatewayRequest.model ?? "unknown",
            providerKey: input.gatewayRequest.providerKey ?? "unknown",
            finishReason: "stop",
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            latencyMs: 0,
          },
          messages,
          toolExecutions,
        };
      }
      const chosenSetup = bookingSetup && "service" in bookingSetup ? bookingSetup : null;
      if (chosenSetup && this.deps.tools) {
        const nearestLanguage = customerReplyLanguage(sourceMessages);
        let nearestText = nearestLookupFailed(nearestLanguage, true);
        try {
          const routed = await this.deps.tools.route(input.ctx, {
            conversationId: input.conversationId,
            toolKey: "find_next_available",
            input: {
              serviceId: chosenSetup.service.id,
              ...(chosenSetup.resourceId ? { resourceId: chosenSetup.resourceId } : {}),
            },
            triggeredBy: "agent",
          });
          toolExecutions.push({
            toolKey: routed.toolKey,
            executionId: routed.executionId,
            status: routed.status,
            output: routed.output,
            durationMs: routed.durationMs,
          });
          nearestText = formatFindNextFacing(routed.output ?? null, nearestLanguage) ?? nearestText;
        } catch {
          nearestText = nearestLookupFailed(nearestLanguage, true);
        }
        return {
          response: {
            text: nearestText,
            model: input.gatewayRequest.model ?? "unknown",
            providerKey: input.gatewayRequest.providerKey ?? "unknown",
            finishReason: "stop",
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            latencyMs: 0,
          },
          messages,
          toolExecutions,
        };
      }
      const availabilityTurn =
        customerWantsOtherSlots(latestCustomerText) ||
        looksLikeAvailabilityTimeQuestion(latestCustomerText) ||
        (assistantAskedForAvailabilityDay(sourceMessages) &&
          !/(?:احجز|أحجز|هحجز|book)/iu.test(latestCustomerText));
      if (availabilityTurn && this.deps.tools) {
        const language = customerReplyLanguage(sourceMessages);
        let otherSlotsText = availabilityLookupFailed(language);
        try {
          const service = resolveDiscussedService(sourceMessages, toolExecutions);
          if (!service) {
            otherSlotsText = askWhichService(language);
          } else {
            const routed = await this.deps.tools.route(input.ctx, {
              conversationId: input.conversationId,
              toolKey: "search_availability",
              input: { serviceId: service.id },
              triggeredBy: "agent",
            });
            toolExecutions.push({
              toolKey: routed.toolKey,
              executionId: routed.executionId,
              status: routed.status,
              output: routed.output,
              durationMs: routed.durationMs,
            });
            const slots = collectAvailabilitySlots(routed.output ?? null);
            const chosenDate = matchChosenAvailabilityDate(
              latestCustomerText,
              [...new Set(slots.map((slot) => slot.date))],
            );
            otherSlotsText = chosenDate
              ? formatAvailabilityTimesForDay(service.name, slots, chosenDate, language)
              : formatAvailabilityDayMenu(service.name, slots, language);
          }
        } catch {
          otherSlotsText = availabilityLookupFailed(language);
        }
        return {
          response: {
            text: otherSlotsText,
            model: input.gatewayRequest.model ?? "unknown",
            providerKey: input.gatewayRequest.providerKey ?? "unknown",
            finishReason: "stop",
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            latencyMs: 0,
          },
          messages,
          toolExecutions,
        };
      }
      const priceTurn =
        looksLikePriceQuestion(latestCustomerText) || looksLikePriceFollowUp(sourceMessages);
      if (
        looksLikeProviderRosterQuestion(latestCustomerText) ||
        looksLikeServiceCatalogQuestion(latestCustomerText) ||
        priceTurn
      ) {
        return {
          response: {
            text: looksLikeProviderRosterQuestion(latestCustomerText)
              ? providerRosterReply(sourceMessages)
              : looksLikeServiceCatalogQuestion(latestCustomerText)
                ? serviceCatalogReply(sourceMessages)
                : priceInquiryReply(sourceMessages),
            model: input.gatewayRequest.model ?? "unknown",
            providerKey: input.gatewayRequest.providerKey ?? "unknown",
            finishReason: "stop",
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            latencyMs: 0,
          },
          messages,
          toolExecutions,
        };
      }

      const earlyFindNext =
        looksLikeCasualReply(latestCustomerText) ||
        looksLikeSchedulingInfoQuestion(latestCustomerText, sourceMessages)
          ? undefined
          : [...toolExecutions]
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
          sourceMessages,
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

      const emptyGatewayResponse = {
        text: "",
        model: input.gatewayRequest.model ?? "unknown",
        providerKey: input.gatewayRequest.providerKey ?? "unknown",
        finishReason: "stop" as const,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        latencyMs: 0,
      };

      const hourClarification = ambiguousHourClarification(sourceMessages, toolExecutions);
      if (hourClarification) {
        return {
          response: { ...emptyGatewayResponse, text: hourClarification },
          messages,
          toolExecutions,
        };
      }

      // Confirming the single offered slot should book (or ask for name/phone)
      // before another slow model round replaces the reply with a re-ask.
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
        // Fall through to the model loop when the forced booking throws.
      }
      if (hasSuccessfulCreateBooking(toolExecutions)) {
        const earlyResponse = applyBookingReplyFallback(
          emptyGatewayResponse,
          toolExecutions,
          sourceMessages,
        );
        if (earlyResponse.text.trim()) {
          return { response: earlyResponse, messages, toolExecutions };
        }
      }
      const confirmedSlot = resolveCanonicalSelectedSlot(sourceMessages, toolExecutions);
      if (
        confirmedSlot &&
        latestUserAllowsForcedCreateBooking(sourceMessages, trustedCustomerId) &&
        !bookingIdentityIsSatisfied(
          readPatientIntakeFromConversation(sourceMessages),
          trustedCustomerId,
        )
      ) {
        return {
          response: {
            ...emptyGatewayResponse,
            text: bookingIntakeMessage(
              readPatientIntakeFromConversation(sourceMessages),
              sourceMessages,
            ),
          },
          messages,
          toolExecutions,
        };
      }
    }

    const purchaseTexts = userTextsFromMessages(sourceMessages);
    if (
      input.deferDeterministicSales &&
      this.deps.tools &&
      input.allowedToolKeys.includes("create_customer") &&
      !trustedCustomerId &&
      messageHasExplicitPurchase(purchaseTexts)
    ) {
      const contact = extractPurchaseContact(purchaseTexts.join("\n"));
      if (contact.name && contact.phoneE164) {
        const purchaseArgs = {
          name: contact.name,
          phone: contact.phoneE164,
          region: "EG",
          ...(contact.email ? { email: contact.email } : {}),
        };
        const purchaseCallId = `purchase-identity-${Date.now()}`;
        let purchaseRouted: Awaited<ReturnType<RuntimeToolPort["route"]>>;
        try {
          purchaseRouted = await this.deps.tools.route(input.ctx, {
            conversationId: input.conversationId,
            toolKey: "create_customer",
            input: purchaseArgs,
            triggeredBy: "agent",
            conversationTexts: purchaseTexts,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Tool routing failed.";
          purchaseRouted = {
            toolKey: "create_customer",
            executionId: `route-error-${Date.now()}`,
            status: "failed",
            output: null,
            durationMs: 0,
            errorCode: "TOOL_ROUTE_THREW",
            errorMessage: message,
          };
        }
        toolExecutions.push({
          toolKey: purchaseRouted.toolKey,
          executionId: purchaseRouted.executionId,
          status: purchaseRouted.status,
          input: purchaseArgs,
          output: purchaseRouted.output,
          durationMs: purchaseRouted.durationMs,
        });
        if (
          purchaseRouted.status === "succeeded" &&
          typeof purchaseRouted.output?.customerId === "string" &&
          isCustomerUuid(purchaseRouted.output.customerId.trim())
        ) {
          trustedCustomerId = purchaseRouted.output.customerId.trim();
        }
        messages.push({
          role: "assistant",
          content: "",
          toolCalls: [{ id: purchaseCallId, name: "create_customer", arguments: purchaseArgs }],
        });
        messages.push({
          role: "tool",
          content: JSON.stringify(
            purchaseRouted.output ?? {
              success: false,
              errorCode: purchaseRouted.errorCode ?? "TOOL_FAILED",
              message: purchaseRouted.errorMessage ?? "Customer was not created.",
            },
          ),
          toolCallId: purchaseCallId,
        });
      }
    }

    const iterationLimit = input.deferDeterministicSales ? MAX_TOOL_ITERATIONS + 2 : MAX_TOOL_ITERATIONS;
    for (let iteration = 0; iteration < iterationLimit; iteration += 1) {
      try {
        response = await this.deps.gateway.chatCompletion({
          ...input.gatewayRequest,
          messages,
          tools: gatewayToolsForCustomerTurn(input.tools, sourceMessages),
        });
      } catch (error) {
        if (!isRecoverableProviderFailure(error) || !hasVerifiedBusinessOutcome(toolExecutions)) {
          throw error;
        }
        const summary = summarizeSalesToolOutcome(toolExecutions, salesFallbackLanguage(sourceMessages));
        console.warn(
          "[sales-tool] provider failed after persisted tools",
          error instanceof Error ? error.name : "unknown",
        );
        return {
          response: {
            text: summary,
            model: input.gatewayRequest.model ?? "unknown",
            providerKey: input.gatewayRequest.providerKey ?? "unknown",
            finishReason: "fallback",
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            latencyMs: 0,
          },
          messages,
          toolExecutions,
        };
      }

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
          iteration < iterationLimit - 1
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
          iteration < iterationLimit - 1
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
            /^e2e-rt-|^idem-/i.test(latestUserTextFromMessages(sourceMessages).trim()) ||
            latestIsTicketStatusOrListIntent(latestUserTextFromMessages(sourceMessages)) ||
            customerWantsAddTicketComment(sourceMessages) ||
            customerWantsChangeTicketFields(sourceMessages))
        ) {
          messages.push({
            role: "tool",
            content: JSON.stringify({
              success: false,
              skipped: true,
              message:
                "Latest customer message is tracking/status, add-comment, or change-status — not a new complaint. Use search_ticket / add_ticket_comment / change_ticket_status. Do not create a ticket.",
            }),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (toolCall.name === "create_ticket") {
          const createArgs =
            toolCall.arguments && typeof toolCall.arguments === "object"
              ? (toolCall.arguments as Record<string, unknown>)
              : {};
          const argDescription =
            typeof createArgs.description === "string" ? createArgs.description.trim() : "";
          const argSubject = typeof createArgs.subject === "string" ? createArgs.subject.trim() : "";
          const latestBody = latestUserTextFromMessages(sourceMessages).trim();
          const effectiveBody =
            (complaintDescriptionIsSufficient(argDescription) ? argDescription : null) ||
            (complaintDescriptionIsSufficient(latestBody) ? latestBody : null) ||
            (complaintDescriptionIsSufficient(argSubject) ? argSubject : null);
          if (!effectiveBody) {
            toolExecutions.push({
              toolKey: "create_ticket",
              executionId: `gate-ticket-need-description-${Date.now()}`,
              status: "failed",
              output: {
                success: false,
                errors: [COMPLAINT_DESCRIPTION_REQUIRED],
                customerFacingMessage: ASK_COMPLAINT_DESCRIPTION_REPLY,
              },
              durationMs: 0,
            });
            messages.push({
              role: "tool",
              content: JSON.stringify({
                success: false,
                errors: [COMPLAINT_DESCRIPTION_REQUIRED],
                customerFacingMessage: ASK_COMPLAINT_DESCRIPTION_REPLY,
                message: "Ask the customer for the full complaint text before create_ticket.",
              }),
              toolCallId: toolCall.id,
            });
            continue;
          }
          createArgs.description = effectiveBody;
          if (!complaintDescriptionIsSufficient(argSubject) || argSubject === "شكوى") {
            createArgs.subject = subjectFromComplaintDescription(effectiveBody);
          }
          const argPriority =
            typeof createArgs.priority === "string" ? createArgs.priority.trim().toLowerCase() : "";
          if (!["low", "normal", "high", "urgent"].includes(argPriority)) {
            createArgs.priority = deriveTicketPriorityFromText(effectiveBody);
          }
          toolCall.arguments = createArgs;
        }

        if (
          toolCall.name === "find_next_available" &&
          !customerWantsFindNextAvailable(sourceMessages) &&
          !findNextIntentEarlierInBooking(sourceMessages)
        ) {
          messages.push({
            role: "tool",
            content: JSON.stringify({
              success: false,
              skipped: true,
              message: "Customer did not ask for the nearest appointment. Do not call find_next_available.",
            }),
            toolCallId: toolCall.id,
          });
          continue;
        }

        if (
          (looksLikeCasualReply(latestUserTextFromMessages(sourceMessages)) ||
            looksLikeSchedulingInfoQuestion(latestUserTextFromMessages(sourceMessages), sourceMessages)) &&
          CASUAL_CHAT_BLOCKED_TOOLS.has(toolCall.name)
        ) {
          messages.push({
            role: "tool",
            content: JSON.stringify({
              success: false,
              skipped: true,
              message: "Customer is greeting or chatting. Do not start a booking.",
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
            ? rewriteCreateBookingArgs(toolCall.arguments, sourceMessages, toolExecutions, trustedCustomerId, messages)
            : toolCall.name === "create_customer"
              ? rewriteCreateCustomerArgs(toolCall.arguments, sourceMessages)
            : toolCall.name === "search_bookings"
              ? {
                  ...toolCall.arguments,
                  // Never trust the LLM purpose flag — cancel list only when cancel intent is active.
                  purpose: modelSearchIsForCancel(sourceMessages) ? "cancel" : "list",
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
              : toolCall.name === "qualify_lead"
                ? rewriteQualifyLeadArgs(
                    toolCall.arguments as Record<string, unknown> | undefined,
                    toolExecutions,
                    trustedCustomerId,
                  )
              : toolCall.arguments;

        if (
          ["search_availability", "find_next_available", "recommend_appointment", "create_booking"].includes(
            toolCall.name,
          ) &&
          !hasSuccessfulCreateBooking(toolExecutions)
        ) {
          const visitMenu = missingVisitTypeMenu(
            [...sourceMessages, ...messages],
            (routedInput as Record<string, unknown> | undefined)?.serviceId,
          );
          if (visitMenu) {
            return {
              response: { ...response, text: visitMenu, toolCalls: undefined, finishReason: "stop" },
              messages,
              toolExecutions,
            };
          }
        }

        const repeatedSignature = toolCallSignature(toolCall.name, routedInput);
        const alreadyAttempted = toolExecutions.some(
          (execution) => toolCallSignature(execution.toolKey, execution.input) === repeatedSignature,
        );
        if (alreadyAttempted) {
          messages.push({
            role: "tool",
            content: JSON.stringify({
              success: false,
              repeated: true,
              message: "This tool was already called with the same arguments. Use that result and reply to the customer.",
            }),
            toolCallId: toolCall.id,
          });
          continue;
        }

        let routed: Awaited<ReturnType<RuntimeToolPort["route"]>>;
        try {
          routed = await this.deps.tools.route(input.ctx, {
            conversationId: input.conversationId,
            toolKey: toolCall.name,
            input: routedInput,
            triggeredBy: "llm",
            conversationTexts: userTextsFromMessages(sourceMessages),
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
            ? omitProductDeliveryImages(routed.output)
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
              input: rewriteCreateBookingArgs(toolCall.arguments, sourceMessages, toolExecutions, trustedCustomerId, messages),
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
        await forceAddTicketCommentIfReady({
          tools: this.deps.tools,
          ctx: input.ctx,
          conversationId: input.conversationId,
          allowedToolKeys: input.allowedToolKeys,
          sourceMessages,
          toolExecutions,
        });
      } catch {
        // Never fail the customer reply because a forced ticket comment threw.
      }
      try {
        await forceChangeTicketFieldsIfReady({
          tools: this.deps.tools,
          ctx: input.ctx,
          conversationId: input.conversationId,
          allowedToolKeys: input.allowedToolKeys,
          sourceMessages,
          toolExecutions,
        });
      } catch {
        // Never fail the customer reply because a forced ticket status change threw.
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
          trustedCustomerId,
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

    if (
      !canSkipFinalCompletion &&
      !response.text.trim() &&
      toolExecutions.length > 0 &&
      !hasVerifiedBusinessOutcome(toolExecutions)
    ) {
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
      toolExecutions.slice(priorSchedulingToolExecutions.length),
    );
    response = applyBookingReplyFallback(response, toolExecutions, input.gatewayRequest.messages);
    response = applyTicketReplyFallback(response, toolExecutions);
    response = applyCloseTicketReplyFallback(response, toolExecutions);
    response = applyTicketMutationReplyFallback(response, toolExecutions);
    response = applyTicketSearchReplyFallback(response, toolExecutions, sourceMessages);
    response = applyAskTicketNumberFallback(response, sourceMessages, toolExecutions);
    response = applySearchBookingsReplyFallback(response, toolExecutions, sourceMessages);
    response = applyBookingStatusReplyFallback(response, toolExecutions, sourceMessages);
    response = applyCancelBookingReplyFallback(response, toolExecutions, sourceMessages);
    response = applyCheckInOutReplyFallback(response, toolExecutions);
    response = applyRescheduleBookingReplyFallback(response, toolExecutions, sourceMessages);
    response = applyRescheduleTopicGuard(response, sourceMessages, toolExecutions);
    response = applyFindNextAvailableReplyFallback(response, toolExecutions, sourceMessages);
    response = applyAskBookingPhoneFallback(response, sourceMessages, toolExecutions, trustedCustomerId);

    // Trusted WhatsApp identity: never re-ask name/phone on active booking turns.
    // Never rewrite cancel / status / ticket / "ليه؟" turns into booking-continue copy.
    const latestForIntent = latestUserTextFromMessages(sourceMessages);
    const allowTrustedBookingContinue =
      !isNonMutatingFollowUpMessage(latestForIntent) &&
      !customerWantsCancelBooking(sourceMessages) &&
      !customerWantsBookingStatusByReference(sourceMessages) &&
      !customerWantsCreateTicket(sourceMessages) &&
      !customerWantsRescheduleBooking(sourceMessages) &&
      !customerWantsCheckInOrOut(sourceMessages) &&
      (latestUserWantsCreateBooking(sourceMessages) ||
        isSlotPickMessage(latestForIntent) ||
        parseRelativeArabicBookingSlot(latestForIntent) !== null ||
        conversationInActiveBookingFlow(sourceMessages, toolExecutions));

    if (
      hasTrustedBookingIdentity(trustedCustomerId) &&
      !hasSuccessfulCreateBooking(toolExecutions) &&
      allowTrustedBookingContinue
    ) {
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
      !customerWantsRecommendationOrAvailability(sourceMessages) &&
      !customerWantsBookingStatusByReference(sourceMessages) &&
      !isNonMutatingFollowUpMessage(latestForIntent)
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
    }

    response = applyNonMutatingFollowUpGuard(response, input.gatewayRequest.messages);

    if (
      allowTrustedBookingContinue &&
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

    response = stripUnofferedComplaintCapability(response, input, this.deps.tools);

    const visitTypeGate = hasSuccessfulCreateBooking(toolExecutions)
      ? undefined
      : toolExecutions.find((execution) => {
          const errors = execution.output?.errors;
          return Array.isArray(errors) && errors.includes(VISIT_TYPE_REQUIRED);
        });
    if (typeof visitTypeGate?.output?.customerFacingMessage === "string") {
      response = { ...response, text: visitTypeGate.output.customerFacingMessage, finishReason: "stop" };
    }

    const branchGate = hasSuccessfulCreateBooking(toolExecutions)
      ? undefined
      : toolExecutions.find((execution) => {
          const errors = execution.output?.errors;
          return Array.isArray(errors) && errors.includes(BRANCH_REQUIRED);
        });
    if (typeof branchGate?.output?.customerFacingMessage === "string") {
      response = { ...response, text: branchGate.output.customerFacingMessage, finishReason: "stop" };
    }

    const complaintDescGate = hasSuccessfulCreateTicket(toolExecutions)
      ? undefined
      : toolExecutions.find((execution) => {
          const errors = execution.output?.errors;
          return Array.isArray(errors) && errors.includes(COMPLAINT_DESCRIPTION_REQUIRED);
        });
    if (typeof complaintDescGate?.output?.customerFacingMessage === "string") {
      response = {
        ...response,
        text: complaintDescGate.output.customerFacingMessage,
        finishReason: "stop",
      };
    }

    const ticketGuidanceGate = toolExecutions.find((execution) => {
      const errors = execution.output?.errors;
      return (
        Array.isArray(errors) &&
        (errors.includes(TICKET_COMMENT_BODY_REQUIRED) ||
          errors.includes(TICKET_STATUS_TARGET_REQUIRED) ||
          errors.includes(TICKET_PICK_REQUIRED))
      );
    });
    if (typeof ticketGuidanceGate?.output?.customerFacingMessage === "string") {
      response = {
        ...response,
        text: ticketGuidanceGate.output.customerFacingMessage,
        finishReason: "stop",
      };
    }

    if (input.deferDeterministicSales && this.deps.tools) {
      response = await groundDeferredCatalogAnswer(
        this.deps.tools,
        input,
        response,
        toolExecutions,
        sourceMessages,
      );
    }

    const guarded = reconcileUnverifiedCustomerClaims(response.text, toolExecutions);
    let guardedText = guarded.adjusted ? guarded.text : response.text;
    const fallbackLanguage = salesFallbackLanguage(sourceMessages);
    if (input.deferDeterministicSales) {
      guardedText = guardUnverifiedQuoteClaims(guardedText, toolExecutions);
    }
    let finishReason = response.finishReason;
    if (!guardedText.trim()) {
      const summary = summarizeSalesToolOutcome(toolExecutions, fallbackLanguage);
      if (summary && (input.deferDeterministicSales || hasVerifiedBusinessOutcome(toolExecutions))) {
        guardedText = summary;
        if (hasVerifiedBusinessOutcome(toolExecutions)) finishReason = "fallback";
      }
    }
    const guardedResponse = { ...response, text: guardedText, finishReason };
    return { response: guardedResponse, messages, toolExecutions };
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

    if (loopResult.response.text.trim() || loopResult.response.finishReason === "fallback") {
      if (loopResult.response.text.trim()) input.onStreamChunk(loopResult.response.text);
      return loopResult;
    }

    let streamedText = "";
    try {
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
    } catch (error) {
      console.warn("[sales-tool] final stream failed", error instanceof Error ? error.message : "unknown");
    }

    if (streamedText.trim()) {
      const guarded = input.deferDeterministicSales
        ? guardUnverifiedQuoteClaims(streamedText, loopResult.toolExecutions)
        : streamedText;
      loopResult.response = { ...loopResult.response, text: guarded };
    } else if (!loopResult.response.text.trim() && input.deferDeterministicSales) {
      const summary = summarizeSalesToolOutcome(loopResult.toolExecutions);
      if (summary) loopResult.response = { ...loopResult.response, text: summary };
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
