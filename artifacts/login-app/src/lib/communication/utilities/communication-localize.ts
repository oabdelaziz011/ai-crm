/**
 * Localize outbound queue channel, status, and template/event keys for Communication Center.
 */

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/-/g, "_");
}

function camelFromSnake(value: string): string {
  return value.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

const CHANNEL_I18N_KEYS: Record<string, string> = {
  whatsapp: "communication.channels.whatsapp",
  email: "communication.channels.email",
  sms: "communication.channels.sms",
  push: "communication.channels.push",
  in_app: "communication.channels.inApp",
  webhook: "communication.channels.webhook",
};

const STATUS_I18N_KEYS: Record<string, string> = {
  queued: "communication.statuses.queued",
  processing: "communication.statuses.processing",
  sent: "communication.statuses.sent",
  delivered: "communication.statuses.delivered",
  failed: "communication.statuses.failed",
  retrying: "communication.statuses.retrying",
  cancelled: "communication.statuses.cancelled",
};

/** Notification / communication template & event keys → i18n. */
const TEMPLATE_I18N_KEYS: Record<string, string> = {
  customer_created: "notifications.platform.events.customer_created",
  appointment_created: "notifications.platform.events.appointment_created",
  appointment_updated: "notifications.platform.events.appointment_updated",
  appointment_cancelled: "notifications.platform.events.appointment_cancelled",
  appointment_reminder: "notifications.platform.events.appointment_reminder",
  invoice_created: "notifications.platform.events.invoice_created",
  payment_received: "notifications.platform.events.payment_received",
  generic_system: "notifications.platform.events.generic_system",
  booking_created: "communication.templates.bookingCreated.title",
  booking_reminder: "communication.templates.bookingReminder.title",
  booking_cancelled: "communication.templates.bookingCancelled.title",
  booking_rescheduled: "communication.templates.bookingRescheduled.title",
  booking_checked_in: "communication.templates.bookingCheckedIn.title",
  booking_completed: "communication.templates.bookingCompleted.title",
  invoice_paid: "communication.templates.invoicePaid.title",
  payment_failed: "communication.templates.paymentFailed.title",
  birthday_greeting: "communication.templates.birthdayGreeting.title",
  follow_up_reminder: "communication.templates.followUpReminder.title",
  marketing_campaign: "communication.templates.marketingCampaign.title",
};

const KNOWN_EVENT_OR_TEMPLATE = new Set(Object.keys(TEMPLATE_I18N_KEYS));

export function isCommunicationEventOrTemplateKey(value: string | null | undefined): boolean {
  const key = normalizeKey(value ?? "");
  if (!key) return false;
  if (KNOWN_EVENT_OR_TEMPLATE.has(key)) return true;
  return Boolean(TEMPLATE_I18N_KEYS[key] || TEMPLATE_I18N_KEYS[camelFromSnake(key)]);
}

function translateOrFallback(t: TranslateFn, i18nKey: string | undefined, fallback: string): string {
  if (!i18nKey) return fallback;
  const translated = t(i18nKey);
  return translated === i18nKey ? fallback : translated;
}

export function localizeCommunicationChannel(
  t: TranslateFn,
  channel: string | null | undefined,
): string {
  const key = normalizeKey(channel ?? "");
  if (!key) return t("communication.channels.unknown");
  return translateOrFallback(t, CHANNEL_I18N_KEYS[key], channel?.trim() || key);
}

export function localizeCommunicationStatus(
  t: TranslateFn,
  status: string | null | undefined,
): string {
  const key = normalizeKey(status ?? "");
  if (!key) return "—";
  return translateOrFallback(t, STATUS_I18N_KEYS[key], status?.trim() || key);
}

export function localizeCommunicationTemplate(
  t: TranslateFn,
  templateKey: string | null | undefined,
): string {
  const raw = templateKey?.trim() ?? "";
  if (!raw || raw === "—") return "—";
  const key = normalizeKey(raw);
  const i18nKey =
    TEMPLATE_I18N_KEYS[key] ??
    (key.includes("_") ? undefined : TEMPLATE_I18N_KEYS[normalizeKey(raw.replace(/([A-Z])/g, "_$1"))]);
  return translateOrFallback(t, i18nKey, raw);
}

export function localizeCommunicationRecipient(
  t: TranslateFn,
  recipient: string | null | undefined,
  _templateKey?: string | null,
): string {
  const raw = recipient?.trim() ?? "";
  if (!raw || raw === "—" || isCommunicationEventOrTemplateKey(raw)) {
    return t("communication.history.recipientInternal");
  }
  return raw;
}

export function resolveDisplayTemplateKey(
  templateKey: string | null | undefined,
  recipient: string | null | undefined,
): string {
  const template = templateKey?.trim() ?? "";
  if (template && template !== "—") return template;
  const maybeEvent = recipient?.trim() ?? "";
  if (isCommunicationEventOrTemplateKey(maybeEvent)) return maybeEvent;
  return template || "—";
}
