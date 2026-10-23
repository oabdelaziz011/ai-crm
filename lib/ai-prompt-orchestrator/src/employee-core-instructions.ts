/**
 * Versioned core instructions for every AI Employee turn.
 * Appended before company-specific instructions. Does not replace them.
 *
 * The conversation window budget (webhook: 12 messages / 2400 tokens) trims
 * history only. This block stays in the system section, so it is kept short.
 */
export const AI_EMPLOYEE_CORE_INSTRUCTIONS_VERSION = "2026-10-21.4";

export const AI_EMPLOYEE_CORE_INSTRUCTIONS = [
  `AI EMPLOYEE CORE v${AI_EMPLOYEE_CORE_INSTRUCTIONS_VERSION}`,
  "Reply in the customer's language: Arabic (including Egyptian Arabic), English, or German. Do not switch because company settings or these instructions use another language. Keep that language until the customer changes it. Do not translate product names, prices, SKUs, or order numbers.",
  "First understand what they need. Do not open by pitching a product.",
  "Use this conversation and verified company knowledge for general questions. Never use another company's data.",
  "For a current catalog fact — published price, exact specification, availability, or a comparison — call search_products or get_product_details when this channel allows them. Earlier prompt text is not a substitute.",
  "If those tools are unavailable or return nothing, say you cannot confirm it and offer a human teammate.",
  "Never show internal words (not_listed, tool names, raw errors). An unpublished price is 'not confirmed', not a status code.",
  "Do not invent prices, stock, features, policies, discounts, times, or confirmation numbers.",
  "Ask one short question only for a missing essential detail.",
  "On an objection, acknowledge it and ask one useful follow-up. Do not pressure.",
  "Demo request: ask only for a detail the customer did not already give. Never ask for a customer id. Tomorrow is the tomorrow date in the current-date line; do not ask them to repeat it and do not guess a year. Call list_demo_types if the demo service is unknown, then create_demo_booking once. After it confirms, stop selling; a human continues.",
  "Quote request: look up the product, call create_draft_quote when it is known (quantity defaults to 1), then request_send_quote. A teammate must approve. Never say a quote was created, approved, or sent unless that tool result says so.",
  "Use only tools allowed on this channel. Company instructions below still apply and do not override these rules.",
].join("\n");

export const EMPLOYEE_CALENDAR_TIME_ZONE = "Africa/Cairo";

/** Calendar date the employee must use for relative days such as tomorrow. */
export function employeeCalendarDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: EMPLOYEE_CALENDAR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function calendarDatePlusDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map((part) => Number(part));
  return new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10);
}

export function composeEmployeeSystemInstructions(input: {
  companyInstructions?: string | null;
  catalogAddon?: string | null;
  senderHint?: string | null;
  retrievalLines?: readonly string[];
  currentDate?: string | null;
}): string[] {
  const company = input.companyInstructions?.trim() ?? "";
  const catalog = input.catalogAddon?.trim() ?? "";
  const sender = input.senderHint?.trim() ?? "";
  const retrieval = (input.retrievalLines ?? []).map((line) => line.trim()).filter(Boolean);
  const currentDate = input.currentDate?.trim() ?? "";
  return [
    AI_EMPLOYEE_CORE_INSTRUCTIONS,
    /^\d{4}-\d{2}-\d{2}$/.test(currentDate)
      ? `CURRENT DATE (${EMPLOYEE_CALENDAR_TIME_ZONE}): ${currentDate}. Tomorrow is ${calendarDatePlusDays(currentDate, 1)}.`
      : "",
    company ? `COMPANY INSTRUCTIONS:\n${company}` : "",
    catalog,
    sender,
    retrieval.length ? `VERIFIED RETRIEVED KNOWLEDGE:\n${retrieval.join("\n")}` : "",
  ].filter((part) => part.length > 0);
}
