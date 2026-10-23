import { detectCustomerLanguage } from "./customer-language.js";

export type SalesToolOutcomeExecution = {
  toolKey: string;
  status: string;
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
};

function quoteWasPersisted(executions: readonly SalesToolOutcomeExecution[]): boolean {
  return executions.some((execution) => {
    if (execution.toolKey !== "create_draft_quote") return false;
    const output = execution.output;
    if (!output || output.success !== true) return false;
    return typeof output.quoteId === "string" && output.quoteId.trim().length > 0;
  });
}

function stableArgs(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return JSON.stringify(value ?? null);
  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) sorted[key] = record[key];
  return JSON.stringify(sorted);
}

export function toolCallSignature(name: string, args: unknown): string {
  return `${name}:${stableArgs(args)}`;
}

export type SalesFallbackLanguage = "en" | "ar" | "de";

const SALES_FALLBACK_COPY: Record<
  SalesFallbackLanguage,
  {
    customer: string;
    lead: string;
    opportunity: string;
    quoteDraft: string;
    quoteMissing: string;
    booked: string;
    notBooked: string;
    generic: string;
  }
> = {
  en: {
    customer: "The customer record was saved.",
    lead: "The lead was saved.",
    opportunity: "The opportunity was saved.",
    quoteDraft: "A draft quote was saved. It was not sent.",
    quoteMissing: "The quote draft was not created, and it was not sent.",
    booked: "The product demo was booked.",
    notBooked: "The product demo was not booked.",
    generic: "I could not complete that request. Nothing was sent.",
  },
  ar: {
    customer: "تم حفظ بيانات العميل.",
    lead: "تم حفظ العميل المحتمل.",
    opportunity: "تم حفظ الفرصة.",
    quoteDraft: "تم حفظ مسودة عرض السعر. لم يتم إرسالها.",
    quoteMissing: "لم يتم إنشاء مسودة عرض السعر، ولم يتم إرسالها.",
    booked: "تم حجز العرض التجريبي للمنتج.",
    notBooked: "لم يتم حجز العرض التجريبي للمنتج.",
    generic: "تعذر إكمال الطلب. لم يتم إرسال أي شيء.",
  },
  de: {
    customer: "Der Kundendatensatz wurde gespeichert.",
    lead: "Der Lead wurde gespeichert.",
    opportunity: "Die Opportunity wurde gespeichert.",
    quoteDraft: "Ein Angebotsentwurf wurde gespeichert. Er wurde nicht gesendet.",
    quoteMissing: "Der Angebotsentwurf wurde nicht erstellt und nicht gesendet.",
    booked: "Die Produktdemo wurde gebucht.",
    notBooked: "Die Produktdemo wurde nicht gebucht.",
    generic: "Die Anfrage konnte nicht abgeschlossen werden. Es wurde nichts gesendet.",
  },
};

function textId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function outputOf(execution: SalesToolOutcomeExecution | undefined): Record<string, unknown> | null {
  return execution?.output ?? null;
}

export function hasVerifiedBusinessOutcome(executions: readonly SalesToolOutcomeExecution[]): boolean {
  return executions.some((execution) => {
    const output = outputOf(execution);
    if (!output || execution.status === "failed" || output.success === false) return false;
    if (execution.toolKey === "create_customer") return Boolean(textId(output.customerId));
    if (execution.toolKey === "create_draft_quote") return Boolean(textId(output.quoteId));
    if (execution.toolKey === "create_demo_booking") {
      return output.bookingPersisted === true || Boolean(textId(output.bookingId));
    }
    if (execution.toolKey === "qualify_lead") return output.qualificationApplied === true;
    return Boolean(textId(output.leadId) || textId(output.opportunityId));
  });
}

const NOT_RECOVERABLE_PROVIDER = /validation|permission denied|schema|policy violation|token budget|not a lead|lead not found/i;
const RECOVERABLE_PROVIDER =
  /provider_rate_limit_exceeded|rate[_ ]limit|too many requests|provider unavailable|provider_unavailable|overloaded|gateway timeout|empty response|temporarily unavailable/i;

/** Provider failures that may be replaced by a verified tool summary. Tool and validation errors stay thrown. */
export function isRecoverableProviderFailure(error: unknown): boolean {
  const code =
    error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const status =
    error && typeof error === "object" && "status" in error ? Number((error as { status?: unknown }).status) : NaN;
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const blob = `${code} ${message}`;
  if (NOT_RECOVERABLE_PROVIDER.test(blob) && !/provider_rate_limit_exceeded|rate[_ ]limit/i.test(blob)) return false;
  if (code === "PROVIDER_UNAVAILABLE" || code === "GATEWAY_TIMEOUT") return true;
  if (status === 429 || status === 502 || status === 503) return true;
  return RECOVERABLE_PROVIDER.test(blob);
}

/**
 * Honest customer-facing text when the model did not produce a reply.
 * Never claims a quote, booking, customer, lead, or opportunity that the tool output does not confirm.
 */
export function summarizeSalesToolOutcome(
  executions: readonly SalesToolOutcomeExecution[],
  language: SalesFallbackLanguage = "en",
): string {
  if (executions.length === 0) return "";
  const copy = SALES_FALLBACK_COPY[language] ?? SALES_FALLBACK_COPY.en;
  const parts: string[] = [];
  const customer = [...executions].reverse().find((execution) => execution.toolKey === "create_customer");
  if (customer?.output?.success === true && textId(customer.output.customerId)) parts.push(copy.customer);
  const leadId = executions.some((execution) => execution.output?.success !== false && textId(execution.output?.leadId));
  if (leadId) parts.push(copy.lead);
  const opportunityId = executions.some(
    (execution) => execution.output?.success !== false && textId(execution.output?.opportunityId),
  );
  if (opportunityId) parts.push(copy.opportunity);
  const quote = [...executions].reverse().find((execution) => execution.toolKey === "create_draft_quote");
  if (quote?.output?.success === true && textId(quote.output.quoteId)) parts.push(copy.quoteDraft);
  else if (quote) parts.push(copy.quoteMissing);
  const booking = [...executions].reverse().find((execution) => execution.toolKey === "create_demo_booking");
  if (
    booking?.output?.success === true &&
    (booking.output.bookingPersisted === true || textId(booking.output.bookingId))
  ) {
    parts.push(copy.booked);
  } else if (booking && booking.output?.success !== true) {
    parts.push(copy.notBooked);
  }
  if (parts.length === 0) return copy.generic;
  return parts.join(" ");
}

const UNVERIFIED_QUOTE_CLAIM =
  /\b(?:quote|quotation) (?:has been|was) (?:created|sent|saved|prepared|emailed)\b|تم (?:إرسال|ارسال) (?:عرض السعر|العرض)/iu;

export function guardUnverifiedQuoteClaims(
  text: string,
  executions: readonly SalesToolOutcomeExecution[],
): string {
  if (!text.trim() || quoteWasPersisted(executions)) return text;
  if (!UNVERIFIED_QUOTE_CLAIM.test(text)) return text;
  const language = detectCustomerLanguage(text) ?? "en";
  return (SALES_FALLBACK_COPY[language] ?? SALES_FALLBACK_COPY.en).quoteMissing;
}
