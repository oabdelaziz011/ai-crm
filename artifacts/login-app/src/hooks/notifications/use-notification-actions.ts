import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  invalidateNotificationQueries,
  notificationsUnreadKey,
} from "@/lib/notifications";
import {
  archiveNotificationViaApplicationLayer,
  markAllNotificationsReadViaApplicationLayer,
  markNotificationReadViaApplicationLayer,
  markNotificationUnreadViaPorts,
} from "@/lib/application-layer/notification-application-bridge";
import { useNotificationPortContext } from "@/hooks/notifications/use-notification-port-context";

export function useNotificationActions(companyId: string | null) {
  const qc = useQueryClient();
  const portContext = useNotificationPortContext();

  const invalidate = () => invalidateNotificationQueries(qc, companyId);

  const optimisticUnreadDelta = (delta: number) => {
    qc.setQueryData<number>(notificationsUnreadKey(companyId), (current = 0) =>
      Math.max(0, current + delta),
    );
  };

  const markRead = useMutation({
    mutationFn: (id: string) => {
      if (!portContext) throw new Error("Not authenticated");
      return markNotificationReadViaApplicationLayer(portContext, id);
    },
    onMutate: async () => {
      optimisticUnreadDelta(-1);
    },
    onError: () => optimisticUnreadDelta(1),
    onSettled: invalidate,
  });

  const markUnread = useMutation({
    mutationFn: (id: string) => {
      if (!portContext) throw new Error("Not authenticated");
      return markNotificationUnreadViaPorts(portContext, id);
    },
    onMutate: () => optimisticUnreadDelta(1),
    onError: () => optimisticUnreadDelta(-1),
    onSettled: invalidate,
  });

  const markAllRead = useMutation({
    mutationFn: () => {
      if (!portContext) throw new Error("Not authenticated");
      return markAllNotificationsReadViaApplicationLayer(portContext);
    },
    onMutate: () => qc.setQueryData(notificationsUnreadKey(companyId), 0),
    onSettled: invalidate,
  });

  const markManyRead = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!portContext) throw new Error("Not authenticated");
      for (const id of ids) {
        await markNotificationReadViaApplicationLayer(portContext, id);
      }
    },
    onMutate: (ids) => optimisticUnreadDelta(-ids.length),
    onSettled: invalidate,
  });

  const archive = useMutation({
    mutationFn: (id: string) => {
      if (!portContext) throw new Error("Not authenticated");
      return archiveNotificationViaApplicationLayer(portContext, id);
    },
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
