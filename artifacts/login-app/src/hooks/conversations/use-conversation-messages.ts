import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useConversationServices } from "@/lib/ai-conversation";
import { auditTranscriptMessagesFromRecords } from "@/lib/omnichannel/debug/omni-transcript-messages-audit";
import { useUser } from "@/context/auth-context";

export function conversationMessagesQueryKey(conversationId: string | null) {
  return ["conversation-messages", conversationId] as const;
}

export function useConversationMessages(conversationId: string | null) {
  const { services, context } = useConversationServices();
  const { profile } = useUser();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;
  const queryKey = conversationMessagesQueryKey(conversationId);
  const markedReadFor = useRef<string | null>(null);

  useEffect(() => {
    if (!conversationId || !context.userId) return;
    if (markedReadFor.current === conversationId) return;
    markedReadFor.current = conversationId;
    void services.conversations.resetEmployeeUnread(context, conversationId).then(() => {
      void queryClient.invalidateQueries({ queryKey: ["conversation-list", companyId] });
    }).catch(() => {
      markedReadFor.current = null;
    });
  }, [companyId, context, conversationId, queryClient, services.conversations]);

  return useQuery({
    queryKey,
    enabled: Boolean(conversationId),
    staleTime: 0,
    queryFn: async () => {
      if (!conversationId) return [];
      const rows = await services.messages.listMessages(context, {
        conversationId,
        limit: 200,
        // Realtime/cache refetches must never mark the thread read. Opening the
        // conversation is handled in the effect above.
        markEmployeeRead: false,
      });
      auditTranscriptMessagesFromRecords(conversationId, rows, {
        stage: "useConversationMessages.ReactQuery.result",
        file: "use-conversation-messages.ts",
        function: "useConversationMessages",
        line: 16,
        queryKey,
        sqlWhere: `conversation_id = '${conversationId}'`,
        orderBy: "sequence_number DESC, created_at DESC → reversed to ASC",
        limit: 200,
      });
      return rows;
    },
  });
}
