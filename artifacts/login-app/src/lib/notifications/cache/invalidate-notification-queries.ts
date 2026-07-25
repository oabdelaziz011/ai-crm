import type { QueryClient } from "@tanstack/react-query";
import {
  NOTIFICATIONS_KEY,
  notificationsUnreadKey,
} from "@/lib/notifications/cache/notification-query-keys";

export function invalidateNotificationQueries(
  qc: QueryClient,
  companyId: string | null,
): void {
  void qc.invalidateQueries({ queryKey: [...NOTIFICATIONS_KEY, "list", companyId] });
  void qc.invalidateQueries({ queryKey: notificationsUnreadKey(companyId) });
  void qc.invalidateQueries({ queryKey: [...NOTIFICATIONS_KEY, "preferences", companyId] });
}
