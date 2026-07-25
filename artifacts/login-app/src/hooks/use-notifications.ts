export {
  useNotificationsInfinite,
  useNotificationsPage,
  useNotificationsRealtime,
} from "@/hooks/notifications/use-notifications";
export {
  useUnreadNotifications,
  useUnreadNotificationsCount,
} from "@/hooks/notifications/use-unread-notifications";
export {
  useNotificationPreferences,
  useUpdateNotificationPreference,
} from "@/hooks/notifications/use-notification-preferences";
export {
  useNotificationActions,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useMarkNotificationsRead,
  useArchiveNotification,
  useDeleteNotification,
} from "@/hooks/notifications/use-notification-actions";

export {
  notificationsListKey,
  notificationsUnreadKey,
} from "@/lib/notifications/cache/notification-query-keys";

import { useNotificationsPage } from "@/hooks/notifications/use-notifications";

/** Page-based notifications — backward compatible with legacy consumers. */
export function useNotifications(companyId: string | null, page: number) {
  return useNotificationsPage(companyId, page);
}
