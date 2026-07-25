import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getNotificationServices,
  invalidateNotificationQueries,
  notificationsUnreadKey,
} from "@/lib/notifications";

export function useNotificationActions(companyId: string | null) {
  const qc = useQueryClient();
  const { notifications } = getNotificationServices();

  const invalidate = () => invalidateNotificationQueries(qc, companyId);

  const optimisticUnreadDelta = (delta: number) => {
    qc.setQueryData<number>(notificationsUnreadKey(companyId), (current = 0) =>
      Math.max(0, current + delta),
    );
  };

  const markRead = useMutation({
    mutationFn: (id: string) => notifications.markRead(companyId!, id),
    onMutate: async (id) => {
      optimisticUnreadDelta(-1);
      return { id };
    },
    onError: () => optimisticUnreadDelta(1),
    onSettled: invalidate,
  });

  const markUnread = useMutation({
    mutationFn: (id: string) => notifications.markUnread(companyId!, id),
    onMutate: () => optimisticUnreadDelta(1),
    onError: () => optimisticUnreadDelta(-1),
    onSettled: invalidate,
  });

  const markAllRead = useMutation({
    mutationFn: () => notifications.markAllRead(companyId!),
    onMutate: () => qc.setQueryData(notificationsUnreadKey(companyId), 0),
    onSettled: invalidate,
  });

  const markManyRead = useMutation({
    mutationFn: (ids: string[]) => notifications.markManyRead(companyId!, ids),
    onMutate: (ids) => optimisticUnreadDelta(-ids.length),
    onSettled: invalidate,
  });

  const archive = useMutation({
    mutationFn: (id: string) => notifications.archive(companyId!, id),
    onSettled: invalidate,
  });

  return {
    markRead,
    markUnread,
    markAllRead,
    markManyRead,
    archive,
  };
}

/** Backward-compatible granular hooks. */
export function useMarkNotificationRead(companyId: string | null) {
  return useNotificationActions(companyId).markRead;
}

export function useMarkAllNotificationsRead(companyId: string | null) {
  return useNotificationActions(companyId).markAllRead;
}

export function useMarkNotificationsRead(companyId: string | null) {
  return useNotificationActions(companyId).markManyRead;
}

export function useArchiveNotification(companyId: string | null) {
  return useNotificationActions(companyId).archive;
}

export function useDeleteNotification(companyId: string | null) {
  return useArchiveNotification(companyId);
}
