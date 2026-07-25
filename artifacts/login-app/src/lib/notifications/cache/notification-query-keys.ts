import type { NotificationListFilter } from "@/lib/notifications/types";

export const NOTIFICATIONS_KEY = ["notifications"] as const;

export function notificationsListKey(
  companyId: string | null,
  filter: NotificationListFilter = {},
) {
  return [
    ...NOTIFICATIONS_KEY,
    "list",
    companyId,
    filter.unreadOnly ?? false,
    filter.priority ?? "all",
    filter.event ?? "all",
    filter.includeArchived ?? false,
    filter.sort ?? "newest",
  ] as const;
}

export function notificationsInfiniteKey(
  companyId: string | null,
  filter: NotificationListFilter = {},
) {
  return [...notificationsListKey(companyId, filter), "infinite"] as const;
}

export function notificationsUnreadKey(companyId: string | null) {
  return [...NOTIFICATIONS_KEY, "unread", companyId] as const;
}

export function notificationPreferencesKey(companyId: string | null, userId?: string | null) {
  return [...NOTIFICATIONS_KEY, "preferences", companyId, userId ?? "tenant"] as const;
}
