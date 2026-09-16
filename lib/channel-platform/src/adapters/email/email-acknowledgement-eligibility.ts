/**
 * Eligibility gates for Automatic Email Acknowledgement.
 * Independent of AI; reuses mailbox / outbound-echo signals where available.
 */

import { normalizeEmailAddress } from "./email-inbound-auto-reply-guard.js";

export type EmailAcknowledgementEligibilityInput = {
  channelKey: string;
  fromEmail?: string | null;
  companyFromEmail?: string | null;
  /** Own outbound Message-ID echoed via IMAP. */
  alreadyExistsAsOutgoing?: boolean;
  /** Header map (lowercased keys preferred). */
  headers?: Record<string, string> | null;
  subject?: string | null;
  /** Inbound message metadata (provider / pipeline). */
  inboundMetadata?: Record<string, unknown> | null;
  /** True when this inbound row was reused (duplicate event). */
  inboundMessageReused?: boolean;
};

export type EmailAcknowledgementEligibilityDecision = {
  eligible: boolean;
  reason: string;
};

function headerValue(headers: Record<string, string> | null | undefined, name: string): string {
  if (!headers) return "";
  const want = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === want) return String(value ?? "");
  }
  return "";
}

function isAutomatedInbound(input: EmailAcknowledgementEligibilityInput): string | null {
  const headers = input.headers ?? {};
  const autoSubmitted = headerValue(headers, "auto-submitted").toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return "auto_submitted";

  const precedence = headerValue(headers, "precedence").toLowerCase();
  if (precedence === "bulk" || precedence === "junk" || precedence === "list") {
    return "precedence_bulk";
  }

  const xAuto = headerValue(headers, "x-autoreply").toLowerCase();
  if (xAuto === "yes" || xAuto === "true" || xAuto === "auto") return "x_autoreply";

  const xLoop = headerValue(headers, "x-autorespond").toLowerCase();
  if (xLoop) return "x_autorespond";

  const valueorAutomation = headerValue(headers, "x-valueor-email-automation").toLowerCase();
  if (valueorAutomation === "acknowledgement") return "valueor_acknowledgement_header";

  const subject = String(input.subject ?? "").toLowerCase();
  if (
    /\bout of office\b/.test(subject) ||
    /\bautomatic reply\b/.test(subject) ||
    /\bauto[- ]?reply\b/.test(subject) ||
    /\bvocation\b/.test(subject) ||
    /\baway from (the )?office\b/.test(subject) ||
    /^undeliverable:/i.test(subject) ||
    /^delivery status notification/i.test(subject) ||
    /^mail delivery failed/i.test(subject) ||
    /^returned mail:/i.test(subject) ||
    /^failure notice/i.test(subject)
  ) {
    return "subject_automated";
  }

  const meta = input.inboundMetadata ?? {};
  const emailAutomation =
    meta.emailAutomation && typeof meta.emailAutomation === "object" && !Array.isArray(meta.emailAutomation)
      ? (meta.emailAutomation as Record<string, unknown>)
      : null;
  if (String(emailAutomation?.type ?? "").toLowerCase() === "acknowledgement") {
    return "metadata_acknowledgement";
  }

  return null;
}

/**
 * Decide whether this inbound should receive an acknowledgement attempt.
 * Does not inspect acknowledgement feature toggle (caller checks config.enabled).
 */
export function evaluateEmailAcknowledgementEligibility(
  input: EmailAcknowledgementEligibilityInput,
): EmailAcknowledgementEligibilityDecision {
  if (input.channelKey !== "email") {
    return { eligible: false, reason: "not_email_channel" };
  }

  if (input.inboundMessageReused) {
    return { eligible: false, reason: "inbound_message_reused" };
  }

  if (input.alreadyExistsAsOutgoing) {
    return { eligible: false, reason: "own_outbound_echo" };
  }

  const from = normalizeEmailAddress(input.fromEmail);
  const company = normalizeEmailAddress(input.companyFromEmail);
  if (from && company && from === company) {
    return { eligible: false, reason: "from_matches_company_mailbox" };
  }

  const automated = isAutomatedInbound(input);
  if (automated) {
    return { eligible: false, reason: automated };
  }

  return { eligible: true, reason: "eligible" };
}
