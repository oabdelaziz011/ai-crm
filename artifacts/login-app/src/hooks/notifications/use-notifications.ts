import { useEffect } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  getNotificationServices,
  notificationsInfiniteKey,
  notificationToLegacyItem,
} from "@/lib/notifications";
import type { NotificationListFilter } from "@/lib/notifications/types";
import type { NotificationItem } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { invalidateNotificationQueries } from "@/lib/notifications/cache/invalidate-notification-queries";
import { useQueryClient } from "@tanstack/react-query";

const PAGE_SIZE = 12;

export function useNotificationsInfinite(
  companyId: string | null,
  filter: NotificationListFilter = {},
) {
  const { notifications } = getNotificationServices();

  return useInfiniteQuery({
    queryKey: notificationsInfiniteKey(companyId, filter),
    enabled: Boolean(companyId),
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const page = await notifications.list(companyId!, pageParam, filter, PAGE_SIZE);
      return page;
    },
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
  });
}

/** Backward-compatible paginated hook for legacy consumers. */
export function useNotificationsPage(companyId: string | null, page: number, filter?: NotificationListFilter) {
  const { notifications } = getNotificationServices();

  return useQuery({
    queryKey: [...notificationsInfiniteKey(companyId, filter ?? {}), "page", page],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<{ items: NotificationItem[]; total: number; pageSize: number }> => {
      const result = await notifications.list(companyId!, page, filter, 8);
      return {
        items: result.items.map(notificationToLegacyItem) as NotificationItem[],
        total: result.total,
        pageSize: result.pageSize,
      };
    },
  });
}

export function useNotificationsRealtime(companyId: string | null) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!companyId) return;

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
        () => invalidateNotificationQueries(qc, companyId),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [companyId, qc]);
}
