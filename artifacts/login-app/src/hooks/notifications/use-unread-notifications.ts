import { useQuery } from "@tanstack/react-query";
import { getNotificationServices, notificationsUnreadKey } from "@/lib/notifications";

export function useUnreadNotifications(companyId: string | null) {
  const { notifications } = getNotificationServices();

  return useQuery({
    queryKey: notificationsUnreadKey(companyId),
    enabled: Boolean(companyId),
    staleTime: 15_000,
    queryFn: () => notifications.getUnreadCount(companyId!),
  });
}

/** Backward-compatible alias. */
export function useUnreadNotificationsCount(companyId: string | null) {
  return useUnreadNotifications(companyId);
}
