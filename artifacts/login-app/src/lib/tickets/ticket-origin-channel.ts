/** Normalize / resolve the customer channel that opened a support ticket. */

export const TICKET_ORIGIN_CHANNELS = [
  "whatsapp",
  "messenger",
  "instagram",
  "email",
  "sms",
  "web",
  "voice",
] as const;

export type TicketOriginChannel = (typeof TICKET_ORIGIN_CHANNELS)[number];

const ALIASES: Record<string, TicketOriginChannel> = {
  whatsapp: "whatsapp",
  wa: "whatsapp",
  messenger: "messenger",
  facebook: "messenger",
  fb: "messenger",
  instagram: "instagram",
  ig: "instagram",
  email: "email",
  mail: "email",
  sms: "sms",
  web: "web",
  webchat: "web",
  voice: "voice",
  phone: "voice",
};

export function normalizeTicketOriginChannel(raw: unknown): TicketOriginChannel | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  return ALIASES[key] ?? null;
}

/**
 * Resolve display/send channel.
 * When a conversation is linked, live conversation.channel_type is source of truth.
 * origin_channel / metadata are fallbacks for display and backfill.
 */
export function resolveTicketOriginChannel(input: {
  originChannel?: string | null;
  conversationChannelType?: string | null;
  metadata?: Record<string, unknown> | null;
}): TicketOriginChannel | null {
  return (
    normalizeTicketOriginChannel(input.conversationChannelType) ||
    normalizeTicketOriginChannel(input.originChannel) ||
    normalizeTicketOriginChannel(input.metadata?.channelKey) ||
    normalizeTicketOriginChannel(input.metadata?.originChannel) ||
    normalizeTicketOriginChannel(input.metadata?.source)
  );
}

export type TicketResolutionTemplateVars = {
  customer_name: string;
  ticket_number: string;
  ticket_subject?: string;
};

/** Interpolate {{var}} placeholders from a localized template string. */
export function interpolateTicketTemplate(
  template: string,
  vars: TicketResolutionTemplateVars,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const value = vars[key as keyof TicketResolutionTemplateVars];
    return value != null ? String(value) : "";
  });
}

/**
 * Build default close-notify body from a localized template.
 * Prefer calling with `t("tickets.closeNotify.template")` so EN/AR live in locale files.
 */
export function buildTicketResolutionMessage(input: {
  ticketNumber: string;
  customerName?: string | null;
  ticketSubject?: string | null;
  template: string;
}): string {
  const customerName = String(input.customerName ?? "").trim();
  return interpolateTicketTemplate(input.template, {
    customer_name: customerName || (input.template.includes("{{customer_name}}") ? "" : ""),
    ticket_number: String(input.ticketNumber ?? "").trim() || "—",
    ticket_subject: String(input.ticketSubject ?? "").trim(),
  }).replace(/\n{3,}/g, "\n\n").trim();
}

/** Metadata keys stamped after a successful same-channel close notification. */
export const TICKET_CLOSE_NOTIFY_META = {
  notifiedAt: "customerCloseNotifiedAt",
  channel: "customerCloseNotifyChannel",
  messageId: "customerCloseNotifyMessageId",
  idempotencyKey: "customerCloseNotifyIdempotencyKey",
} as const;

export function hasTicketCloseCustomerNotified(metadata: Record<string, unknown> | null | undefined): boolean {
  if (!metadata) return false;
  const at = metadata[TICKET_CLOSE_NOTIFY_META.notifiedAt];
  return typeof at === "string" && at.trim().length > 0;
}
