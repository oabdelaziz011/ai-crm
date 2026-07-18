import { useQuery } from "@tanstack/react-query";
import { useConversationServices } from "@/lib/ai-conversation";

export function conversationMessagesQueryKey(conversationId: string | null) {
  return ["conversation-messages", conversationId] as const;
}

export function useConversationMessages(conversationId: string | null) {
  const { services, context } = useConversationServices();

  return useQuery({
    queryKey: conversationMessagesQueryKey(conversationId),
    enabled: Boolean(conversationId),
    staleTime: 5_000,
    queryFn: async () => {
      if (!conversationId) return [];
      return services.messages.listMessages(context, {
        conversationId,
        limit: 200,
      });
    },
  });
}
