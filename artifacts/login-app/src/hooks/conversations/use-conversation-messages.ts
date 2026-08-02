import { useQuery } from "@tanstack/react-query";
import { useConversationServices } from "@/lib/ai-conversation";
import { auditTranscriptMessagesFromRecords } from "@/lib/omnichannel/debug/omni-transcript-messages-audit";

export function conversationMessagesQueryKey(conversationId: string | null) {
  return ["conversation-messages", conversationId] as const;
}

export function useConversationMessages(conversationId: string | null) {
  const { services, context } = useConversationServices();
  const queryKey = conversationMessagesQueryKey(conversationId);

  return useQuery({
    queryKey,
    enabled: Boolean(conversationId),
    staleTime: 5_000,
    queryFn: async () => {
      if (!conversationId) return [];
      const rows = await services.messages.listMessages(context, {
        conversationId,
        limit: 200,
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
