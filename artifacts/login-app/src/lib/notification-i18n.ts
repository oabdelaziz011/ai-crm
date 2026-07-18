import { format } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import type { TFunction } from "i18next";
import i18n from "@/i18n";
import type { NotificationItem } from "@/lib/types";

/** Legacy English titles stored before i18n keys were introduced. */
const LEGACY_TITLE_KEYS: Record<string, string> = {
  "New Customer": "notifications.events.newCustomer.title",
  "New Booking": "notifications.events.newBooking.title",
  "Booking Cancelled": "notifications.events.bookingCancelled.title",
  "Invoice Paid": "notifications.events.invoicePaid.title",
  "Invoice Overdue": "notifications.events.invoiceOverdue.title",
  "Subscription expires in 5 days": "notifications.events.subscriptionExpiresSoon.title",
  "Subscription expired": "notifications.events.subscriptionExpired.title",
  "User created": "notifications.events.userCreated.title",
  "User deleted": "notifications.events.userDeleted.title",
  "Role updated": "notifications.events.roleUpdated.title",
  "Role created": "notifications.events.roleCreated.title",
  "WhatsApp failed": "notifications.events.whatsappFailed.title",
  "AI task completed": "notifications.events.aiTaskCompleted.title",
};

/** Last-resort fallback for rows stored before messageKey was explicit. */
const LEGACY_MESSAGE_KEYS: Record<string, string> = {
  "notifications.events.newCustomer.title": "notifications.events.newCustomer.message",
  "notifications.events.newBooking.title": "notifications.events.newBooking.message",
  "notifications.events.bookingCancelled.title": "notifications.events.bookingCancelled.message",
  "notifications.events.invoicePaid.title": "notifications.events.invoicePaid.message",
  "notifications.events.invoiceOverdue.title": "notifications.events.invoiceOverdue.message",
  "notifications.events.subscriptionExpiresSoon.title": "notifications.events.subscriptionExpiresSoon.message",
  "notifications.events.subscriptionExpired.title": "notifications.events.subscriptionExpired.message",
  "notifications.events.userCreated.title": "notifications.events.userCreated.message",
  "notifications.events.userDeleted.title": "notifications.events.userDeleted.message",
  "notifications.events.roleUpdated.title": "notifications.events.roleUpdated.message",
  "notifications.events.roleCreated.title": "notifications.events.roleCreated.message",
  "notifications.events.whatsappFailed.title": "notifications.events.whatsappFailed.message",
  "notifications.events.aiTaskCompleted.title": "notifications.events.aiTaskCompleted.message",
};

export type NotificationPayload = {
  messageKey: string | null;
  params: Record<string, string> | null;
};

export function resolveNotificationTitleKey(titleKey: string): string {
  if (titleKey.startsWith("notifications.")) {
    return titleKey;
  }
  return LEGACY_TITLE_KEYS[titleKey] ?? titleKey;
}

function toParamRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, String(entry ?? "")]),
  );
}

export function parseNotificationPayload(message: string): NotificationPayload {
  const trimmed = message?.trim();
  if (!trimmed) {
    return { messageKey: null, params: {} };
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { messageKey: null, params: null };
    }

    const record = parsed as Record<string, unknown>;
    if (typeof record.messageKey === "string") {
      return {
        messageKey: record.messageKey,
        params: toParamRecord(record.params),
      };
    }

    return {
      messageKey: null,
      params: toParamRecord(parsed),
    };
  } catch {
    return { messageKey: null, params: null };
  }
}

function resolveLegacyMessageKey(titleKey: string): string | null {
  return LEGACY_MESSAGE_KEYS[titleKey] ?? null;
}

function formatNotificationParams(
  params: Record<string, string>,
  t: TFunction,
  language: string,
  messageKey: string,
): Record<string, string> {
  const dateLocale = language === "ar" ? ar : enUS;
  const resolved: Record<string, string> = { ...params };

  if (resolved.name === "") {
    resolved.name = t("notifications.defaults.unknown");
  }
  if (resolved.service === "") {
    resolved.service = t("notifications.defaults.service");
  }
  if (resolved.companyName === "") {
    resolved.companyName = t("notifications.defaults.company");
  }
  if (resolved.roleName === "") {
    resolved.roleName = t("notifications.defaults.role");
  }
  if (!resolved.detail?.trim()) {
    if (messageKey.includes("whatsappFailed")) {
      resolved.detail = t("notifications.events.whatsappFailed.fallback");
    } else if (messageKey.includes("aiTaskCompleted")) {
      resolved.detail = t("notifications.events.aiTaskCompleted.fallback");
    }
  }
  if (resolved.expiresOn) {
    const parsed = new Date(resolved.expiresOn);
    if (!Number.isNaN(parsed.getTime())) {
      resolved.expiresOn = format(parsed, "PPP", { locale: dateLocale });
    }
  }

  return resolved;
}

export function localizeNotification(
  t: TFunction,
  item: Pick<NotificationItem, "title_key" | "message">,
): { title: string; message: string } {
  const titleKey = resolveNotificationTitleKey(item.title_key);
  const payload = parseNotificationPayload(item.message);
  const messageKey = payload.messageKey ?? resolveLegacyMessageKey(titleKey);

  if (payload.params !== null && i18n.exists(titleKey)) {
    const params = formatNotificationParams(
      payload.params,
      t,
      i18n.language,
      messageKey ?? titleKey,
    );

    return {
      title: t(titleKey, params),
      message:
        messageKey && i18n.exists(messageKey)
          ? t(messageKey, params)
          : messageKey
            ? t(messageKey, params)
            : item.message,
    };
  }

  if (i18n.exists(titleKey)) {
    return {
      title: t(titleKey),
      message: item.message,
    };
  }

  return {
    title: item.title_key,
    message: item.message,
  };
}
