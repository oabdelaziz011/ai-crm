import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useConversationServices } from "@/lib/ai-conversation";
import { conversationListQueryKey } from "./use-conversation-list";
import { conversationMessagesQueryKey } from "./use-conversation-messages";

export function useConversationActions(companyId: string | null) {
  const queryClient = useQueryClient();
  const { services, context } = useConversationServices();

  const invalidate = async (conversationId?: string) => {
    await queryClient.invalidateQueries({ queryKey: ["conversation-list", companyId] });
    if (conversationId) {
      await queryClient.invalidateQueries({ queryKey: conversationMessagesQueryKey(conversationId) });
    }
  };

  const assign = useMutation({
    mutationFn: async (input: { conversationId: string; assignedUserId: string }) =>
      services.conversations.assignConversation(context, input),
    onSuccess: (_, variables) => invalidate(variables.conversationId),
  });

  const release = useMutation({
    mutationFn: async (input: { conversationId: string }) =>
      services.conversations.releaseConversation(context, input),
    onSuccess: (_, variables) => invalidate(variables.conversationId),
  });

  const close = useMutation({
    mutationFn: async (input: { conversationId: string }) =>
      services.conversations.closeConversation(context, input),
    onSuccess: (_, variables) => invalidate(variables.conversationId),
  });

  const updateMetadata = useMutation({
    mutationFn: async (input: { conversationId: string; metadata: Record<string, unknown> }) =>
      services.conversations.updateMetadata(context, input),
    onSuccess: (_, variables) => invalidate(variables.conversationId),
  });

  const updateState = useMutation({
    mutationFn: async (input: { conversationId: string; state: import("@workspace/ai-conversation").ConversationState }) =>
      services.conversations.updateState(context, input),
    onSuccess: (_, variables) => invalidate(variables.conversationId),
  });

  return { assign, release, close, updateMetadata, updateState, invalidate };
}
