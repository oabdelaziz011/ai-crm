/**
 * Resolve outbound recipient metadata for ticket Close & Notify.
 * Same-channel only — never invent a different channel or WhatsApp/CRM phone override.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const E164_RE = /^\+[1-9]\d{6,14}$/;

export function looksLikeEmailAddress(value: string | null | undefined): boolean {
  const trimmed = String(value ?? "").trim();
  return Boolean(trimmed) && EMAIL_RE.test(trimmed) && !trimmed.includes(" ");
}

export function looksLikeE164Phone(value: string | null | undefined): boolean {
  return E164_RE.test(String(value ?? "").trim());
}

function asEmailFromAddressObject(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const email =
    typeof record.email === "string"
      ? record.email.trim()
      : typeof record.address === "string"
        ? record.address.trim()
        : "";
  return looksLikeEmailAddress(email) ? email : null;
}

/** Prefer channel-session / inbound sender identity over CRM customer email. */
export function resolveCloseNotifyEmailRecipient(sources: {
  sessionSenderExternalId?: string | null;
  conversationMetadata?: Record<string, unknown> | null;
  inboundMessageMetadata?: Record<string, unknown> | null;
  customerEmail?: string | null;
}): string | null {
  const candidates: Array<string | null | undefined> = [
    sources.sessionSenderExternalId,
    typeof sources.conversationMetadata?.senderExternalId === "string"
      ? sources.conversationMetadata.senderExternalId
      : null,
    typeof sources.conversationMetadata?.sender_external_id === "string"
      ? sources.conversationMetadata.sender_external_id
      : null,
    asEmailFromAddressObject(sources.conversationMetadata?.from),
    typeof sources.inboundMessageMetadata?.senderExternalId === "string"
      ? sources.inboundMessageMetadata.senderExternalId
      : null,
    asEmailFromAddressObject(sources.inboundMessageMetadata?.from),
    sources.customerEmail,
  ];

  for (const candidate of candidates) {
    const trimmed = String(candidate ?? "").trim();
    if (looksLikeEmailAddress(trimmed)) return trimmed.toLowerCase();
  }
  return null;
}

export function resolveCloseNotifySubject(sources: {
  conversationMetadata?: Record<string, unknown> | null;
  inboundMessageMetadata?: Record<string, unknown> | null;
  ticketNumber: string;
}): string {
  const raw =
    (typeof sources.inboundMessageMetadata?.subject === "string"
      ? sources.inboundMessageMetadata.subject
      : null) ||
    (typeof sources.conversationMetadata?.subject === "string"
      ? sources.conversationMetadata.subject
      : null) ||
    "";
  const trimmed = raw.trim();
  if (trimmed) {
    return /^re:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
  }
  return `Re: ${sources.ticketNumber}`;
}

/**
 * For SMS only: if session thread id is not a phone, try session sender id.
 * Never substitutes CRM customer phone (same rule as WhatsApp session binding).
 */
export function resolveCloseNotifySmsThreadId(sources: {
  sessionExternalThreadId: string;
  sessionSenderExternalId?: string | null;
}): string {
  const thread = sources.sessionExternalThreadId.trim();
  if (looksLikeE164Phone(thread)) return thread;
  const sender = String(sources.sessionSenderExternalId ?? "").trim();
  if (looksLikeE164Phone(sender)) return sender;
  // Pass through existing thread id — adapter will validate.
  return thread;
}
