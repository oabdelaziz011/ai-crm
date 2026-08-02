import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import { supabase } from "@/lib/supabase";
import { invalidateOmnichannelQueries } from "@/lib/omnichannel/cache/invalidate-omnichannel-queries";
import { omniCompanyTrace } from "@/lib/omnichannel/debug/omni-company-audit";

const RT = "[OMNI_REALTIME]";

function rtLog(event: string, detail?: Record<string, unknown>) {
  const entry = { at: new Date().toISOString(), event, ...detail };
  console.info(RT, event, detail ?? {});
  if (typeof window !== "undefined") {
    const w = window as unknown as { __OMNI_RT_LOGS?: unknown[] };
    w.__OMNI_RT_LOGS ??= [];
    w.__OMNI_RT_LOGS.push(entry);
  }
}

function recordId(payload: { new?: unknown; old?: unknown }): string | null {
  const row = (payload.new ?? payload.old) as { id?: string } | null | undefined;
  return row?.id ?? null;
}

export function useConversationRealtime(companyId: string | null, conversationId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!companyId) {
      rtLog("effect.skip", { reason: "no_companyId" });
      return;
    }

    const channelName = `omnichannel:${companyId}`;
    rtLog("effect.mount", { channelName, companyId, conversationId });

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          rtLog("postgres_changes", {
            schema: "public",
            table: "conversations",
            eventType: payload.eventType,
            recordId: recordId(payload),
          });
          invalidateOmnichannelQueries(queryClient, {
            companyId,
            conversationId: conversationId ?? undefined,
            source: "conversations",
          });
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
          rtLog("postgres_changes", {
            schema: "public",
            table: "conversation_messages",
            eventType: payload.eventType,
            recordId: recordId(payload),
            conversationId: nextConversationId || conversationId,
          });
          invalidateOmnichannelQueries(queryClient, {
            companyId,
            conversationId: nextConversationId || conversationId || undefined,
            source: "conversation_messages",
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "channel_sessions",
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          rtLog("postgres_changes", {
            schema: "public",
            table: "channel_sessions",
            eventType: payload.eventType,
            recordId: recordId(payload),
          });
          invalidateOmnichannelQueries(queryClient, {
            companyId,
            conversationId: conversationId ?? undefined,
            source: "channel_sessions",
          });
        },
      )
      .subscribe((status, err) => {
        rtLog("subscribe.status", { status, error: err?.message ?? null, channelName });
      });

    return () => {
      rtLog("effect.cleanup", { channelName });
      void supabase.removeChannel(channel);
    };
  }, [companyId, conversationId, queryClient]);
}

export function useOmnichannelAccess() {
  const { user, profile, company, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();

  const access = useMemo(() => {
    if (!user?.id || !profile?.company_id) return null;
    return {
      userId: user.id,
      companyId: profile.company_id,
      isSuperAdmin: Boolean(isSuperAdmin),
      hasPermission,
    };
  }, [user?.id, profile?.company_id, isSuperAdmin, hasPermission]);

  useEffect(() => {
    omniCompanyTrace("useOmnichannelAccess", {
      userId: user?.id ?? null,
      userEmail: user?.email ?? null,
      profileCompanyId: profile?.company_id ?? null,
      companyRecordId: company?.id ?? null,
      companyId: access?.companyId ?? profile?.company_id ?? null,
      extra: { accessNull: access === null },
    });
  }, [user?.id, user?.email, profile?.company_id, company?.id, access?.companyId, access]);

  return access;
}
