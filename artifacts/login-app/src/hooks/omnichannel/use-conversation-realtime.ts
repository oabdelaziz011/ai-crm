import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import { supabase } from "@/lib/supabase";
import { invalidateOmnichannelQueries } from "@/lib/omnichannel/cache/invalidate-omnichannel-queries";

export function useConversationRealtime(companyId: string | null, conversationId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!companyId) return;

    const channel = supabase
      .channel(`omnichannel:${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          invalidateOmnichannelQueries(queryClient, { companyId, conversationId: conversationId ?? undefined });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_messages",
        },
        (payload) => {
          const nextConversationId =
            typeof payload.new === "object"
            && payload.new
            && "conversation_id" in payload.new
              ? String((payload.new as { conversation_id?: string }).conversation_id ?? "")
              : conversationId;
          invalidateOmnichannelQueries(queryClient, {
            companyId,
            conversationId: nextConversationId || conversationId || undefined,
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [companyId, conversationId, queryClient]);
}

export function useOmnichannelAccess() {
  const { user, profile, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();

  return useMemo(() => {
    if (!user?.id || !profile?.company_id) return null;
    return {
      userId: user.id,
      companyId: profile.company_id,
      isSuperAdmin: Boolean(isSuperAdmin),
      hasPermission,
    };
  }, [user?.id, profile?.company_id, isSuperAdmin, hasPermission]);
}
