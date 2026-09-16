/**
 * SMS Workspace realtime — invalidate list/messages for channel_type = sms.
 */
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { invalidateOmnichannelQueries } from "@/lib/omnichannel/cache/invalidate-omnichannel-queries";

export const SMS_WORKSPACE_SOFT_POLL_MS = 15_000;

export function useSmsWorkspaceRealtime(
  companyId: string | null,
  selectedConversationId: string | null,
  options?: { listReady?: boolean },
) {
  const queryClient = useQueryClient();
  const selectedRef = useRef(selectedConversationId);
  selectedRef.current = selectedConversationId;

  useEffect(() => {
    if (!companyId) return;

    const channelName = `sms-workspace:${companyId}`;
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
          const row = (payload.new ?? payload.old) as { channel_type?: string } | null;
          if (row?.channel_type && row.channel_type !== "sms") return;
          invalidateOmnichannelQueries(queryClient, {
            companyId,
            conversationId: selectedRef.current ?? undefined,
            source: "sms_conversations",
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
        () => {
          invalidateOmnichannelQueries(queryClient, {
            companyId,
            conversationId: selectedRef.current ?? undefined,
            source: "sms_conversation_messages",
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [companyId, queryClient]);

  useEffect(() => {
    if (!companyId || options?.listReady === false) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      invalidateOmnichannelQueries(queryClient, {
        companyId,
        conversationId: selectedRef.current ?? undefined,
        source: "sms_soft_poll",
      });
    }, SMS_WORKSPACE_SOFT_POLL_MS);
    return () => window.clearInterval(timer);
  }, [companyId, options?.listReady, queryClient]);
}
