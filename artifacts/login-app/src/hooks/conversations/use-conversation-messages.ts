import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { ConversationRecord } from "@workspace/ai-conversation";
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
    void services.conversations.resetEmployeeUnread(context, conversationId).then((updated) => {
      // Patch unread in place so the list does not need a full refetch to clear badges.
      // Ordering/bucket must not change on open; avoid depending on a refetch race with draft autosave.
      if (companyId) {
        queryClient.setQueriesData<ConversationRecord[]>(
          { queryKey: ["conversation-list", companyId] },
          (current) => {
            if (!Array.isArray(current)) return current;
            return current.map((row) =>
              row.id === conversationId
                ? {
                    ...row,
                    unread_count_employee: 0,
                    // Preserve list activity ordering: do not adopt bumped updated_at from mark-read.
                    updated_at: row.updated_at,
                    updated_by: updated.updated_by ?? row.updated_by,
                  }
                : row,
            );
          },
        );
      }
      void queryClient.invalidateQueries({
        queryKey: ["conversation-list", companyId],
        // Refetch in background for consistency, but local patch already cleared unread.
        refetchType: "active",
      });
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
