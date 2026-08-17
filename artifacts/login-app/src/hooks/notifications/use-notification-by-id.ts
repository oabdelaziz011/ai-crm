import { useQuery } from "@tanstack/react-query";
import { getNotificationServices } from "@/lib/notifications";
import { notificationsInfiniteKey } from "@/lib/notifications/cache/notification-query-keys";

export function useNotificationById(companyId: string | null, notificationId: string | null) {
  return useQuery({
    queryKey: [...notificationsInfiniteKey(companyId, {}), "detail", notificationId],
    enabled: Boolean(companyId && notificationId),
    queryFn: () => getNotificationServices().notifications.getById(companyId!, notificationId!),
  });
}
