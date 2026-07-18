import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { NotificationItem } from "@/lib/types";

const PAGE_SIZE = 8;

export const notificationsListKey = (companyId: string | null, page: number) =>
  ["notifications", "list", companyId, page] as const;

export const notificationsUnreadKey = (companyId: string | null) =>
  ["notifications", "unread", companyId] as const;

export function useNotifications(companyId: string | null, page: number) {
  return useQuery({
    queryKey: notificationsListKey(companyId, page),
    enabled: Boolean(companyId),
    queryFn: async (): Promise<{ items: NotificationItem[]; total: number; pageSize: number }> => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await supabase
        .from("notifications")
        .select("id, company_id, user_id, title, message, type, category, is_read, created_at", {
          count: "exact",
        })
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw new Error(error.message);

      return {
        items: (data ?? []).map(({ title, ...row }) => ({
          ...row,
          title_key: title,
        })) as NotificationItem[],
        total: count ?? 0,
        pageSize: PAGE_SIZE,
      };
    },
  });
}

export function useUnreadNotificationsCount(companyId: string | null) {
  return useQuery({
    queryKey: notificationsUnreadKey(companyId),
    enabled: Boolean(companyId),
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("is_read", false);

      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });
}

export function useMarkNotificationRead(companyId: string | null) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", id)
        .eq("company_id", companyId);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notifications", "list", companyId] });
      void qc.invalidateQueries({ queryKey: notificationsUnreadKey(companyId) });
    },
  });
}

export function useMarkAllNotificationsRead(companyId: string | null) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("company_id", companyId)
        .eq("is_read", false);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notifications", "list", companyId] });
      void qc.invalidateQueries({ queryKey: notificationsUnreadKey(companyId) });
    },
  });
}

export function useDeleteNotification(companyId: string | null) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("id", id)
        .eq("company_id", companyId);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notifications", "list", companyId] });
      void qc.invalidateQueries({ queryKey: notificationsUnreadKey(companyId) });
    },
  });
}

export function useMarkNotificationsRead(companyId: string | null) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!companyId || ids.length === 0) {
        return;
      }

      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("company_id", companyId)
        .in("id", ids)
        .eq("is_read", false);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notifications", "list", companyId] });
      void qc.invalidateQueries({ queryKey: notificationsUnreadKey(companyId) });
    },
  });
}

export function useNotificationsRealtime(companyId: string | null) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!companyId) return;

    const channel = supabase
      .channel(`notifications:${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          void qc.invalidateQueries({ queryKey: ["notifications", "list", companyId] });
          void qc.invalidateQueries({ queryKey: notificationsUnreadKey(companyId) });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [companyId, qc]);
}
