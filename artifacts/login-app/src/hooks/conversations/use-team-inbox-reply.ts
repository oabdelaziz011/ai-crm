import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { useChannelPlatformServices } from "@/lib/channel-platform";
import { useConversationServices } from "@/lib/ai-conversation";
import { supabase } from "@/lib/supabase";
import { conversationMessagesQueryKey } from "./use-conversation-messages";

type ReplyTarget = {
  conversationId: string;
  companyChannelId: string | null;
  channelKey: string;
  externalThreadId: string | null;
};

async function resolveChannelSession(conversationId: string) {
  const { data } = await supabase
    .from("channel_sessions")
    .select("id, external_thread_id, channel_key, company_channel_id")
    .eq("conversation_id", conversationId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export function useTeamInboxReply(companyId: string | null) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { services: conversationServices, context: conversationContext } = useConversationServices();
  const { services: channelPlatform, context: channelContext } = useChannelPlatformServices();
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const sendReply = useCallback(
    async (target: ReplyTarget, text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !companyId || isSending) return;

      setError(null);
      setIsSending(true);

      try {
        await conversationServices.messages.addMessage(conversationContext, {
          conversationId: target.conversationId,
          messageType: "outgoing",
          contentType: "text",
          content: trimmed,
          metadata: { source: "team_inbox", agentUserId: profile?.id ?? null },
        });

        const session = await resolveChannelSession(target.conversationId);

        if (session?.id && session.company_channel_id && session.external_thread_id) {
          await channelPlatform.dispatcher.dispatch(channelContext, {
            companyId,
            companyChannelId: session.company_channel_id,
            channelKey: session.channel_key ?? target.channelKey,
            conversationId: target.conversationId,
            channelSessionId: session.id,
            externalThreadId: session.external_thread_id,
            text: trimmed,
            persistConversationMessage: false,
            metadata: { source: "team_inbox" },
          });
        }

        await queryClient.invalidateQueries({
          queryKey: conversationMessagesQueryKey(target.conversationId),
        });
        await queryClient.invalidateQueries({ queryKey: ["conversation-list", companyId] });
      } catch (err) {
        setError(err instanceof Error ? err.message : "send_failed");
      } finally {
        setIsSending(false);
      }
    },
    [
      channelContext,
      channelPlatform.dispatcher,
      companyId,
      conversationContext,
      conversationServices.messages,
      isSending,
      profile?.id,
      queryClient,
    ],
  );

  return { sendReply, isSending, error };
}
