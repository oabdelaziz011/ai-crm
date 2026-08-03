import { useQuery } from "@tanstack/react-query";
import { notificationsUnreadKey } from "@/lib/notifications/cache/notification-query-keys";
import { fetchNotificationsViaApplicationLayer } from "@/lib/application-layer/notification-application-bridge";
import { useNotificationPortContext } from "@/hooks/notifications/use-notification-port-context";

export function useUnreadNotifications(companyId: string | null) {
  const portContext = useNotificationPortContext();

  return useQuery({
    queryKey: notificationsUnreadKey(companyId),
    enabled: Boolean(companyId && portContext),
    staleTime: 15_000,
    queryFn: async () => {
      const projection = await fetchNotificationsViaApplicationLayer(portContext!, {
        page: 1,
        pageSize: 1,
      });
      return projection.unreadCount;
    },
  });
}

/** Backward-compatible alias. */
export function useUnreadNotificationsCount(companyId: string | null) {
  return useUnreadNotifications(companyId);
}
