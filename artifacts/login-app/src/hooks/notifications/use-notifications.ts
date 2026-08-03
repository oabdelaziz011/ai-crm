import { useEffect } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NotificationListFilter } from "@/lib/notifications/types";
import type { NotificationItem } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import {
  notificationsInfiniteKey,
  notificationsUnreadKey,
} from "@/lib/notifications/cache/notification-query-keys";
import { invalidateNotificationQueries } from "@/lib/notifications/cache/invalidate-notification-queries";
import {
  fetchNotificationsViaApplicationLayer,
  mapProjectionItemToLegacy,
  mapProjectionItemToNotification,
} from "@/lib/application-layer/notification-application-bridge";
import { useNotificationPortContext } from "@/hooks/notifications/use-notification-port-context";

const PAGE_SIZE = 12;

/** One realtime subscription per company — safe for multiple NotificationBell mounts. */
const notificationRealtimeRefCounts = new Map<string, number>();
const notificationRealtimeChannels = new Map<string, ReturnType<typeof supabase.channel>>();

function retainNotificationRealtime(companyId: string, onChange: () => void) {
  const count = notificationRealtimeRefCounts.get(companyId) ?? 0;
  notificationRealtimeRefCounts.set(companyId, count + 1);

  if (count === 0) {
    const channel = supabase
      .channel(`notifications-platform:${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `company_id=eq.${companyId}`,
        },
        onChange,
      )
      .subscribe();
    notificationRealtimeChannels.set(companyId, channel);
  }

  return () => {
    const next = (notificationRealtimeRefCounts.get(companyId) ?? 1) - 1;
    if (next <= 0) {
      notificationRealtimeRefCounts.delete(companyId);
      const channel = notificationRealtimeChannels.get(companyId);
      if (channel) {
        void supabase.removeChannel(channel);
        notificationRealtimeChannels.delete(companyId);
      }
      return;
    }
    notificationRealtimeRefCounts.set(companyId, next);
  };
}

export function useNotificationsInfinite(
  companyId: string | null,
  filter: NotificationListFilter = {},
) {
  const portContext = useNotificationPortContext();

  return useInfiniteQuery({
    queryKey: notificationsInfiniteKey(companyId, filter),
    enabled: Boolean(companyId && portContext),
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const projection = await fetchNotificationsViaApplicationLayer(portContext!, {
        ...filter,
        page: pageParam,
        pageSize: PAGE_SIZE,
      });
      return {
        items: projection.notifications.map((item) => mapProjectionItemToNotification(item, companyId!)),
        total: projection.total,
        page: projection.page,
        pageSize: projection.pageSize,
        hasMore: projection.hasMore,
      };
    },
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
  });
}

/** Backward-compatible paginated hook for legacy consumers. */
export function useNotificationsPage(companyId: string | null, page: number, filter?: NotificationListFilter) {
  const portContext = useNotificationPortContext();

  return useQuery({
    queryKey: [...notificationsInfiniteKey(companyId, filter ?? {}), "page", page],
    enabled: Boolean(companyId && portContext),
    queryFn: async (): Promise<{ items: NotificationItem[]; total: number; pageSize: number }> => {
      const projection = await fetchNotificationsViaApplicationLayer(portContext!, {
        ...(filter ?? {}),
        page,
        pageSize: 8,
      });
      return {
        items: projection.notifications.map(mapProjectionItemToLegacy) as NotificationItem[],
        total: projection.total,
        pageSize: projection.pageSize,
      };
    },
  });
}

export function useNotificationsRealtime(companyId: string | null) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!companyId) return;
    return retainNotificationRealtime(companyId, () => invalidateNotificationQueries(qc, companyId));
  }, [companyId, qc]);
}

export { notificationsUnreadKey };
