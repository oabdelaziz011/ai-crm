import { useQuery } from "@tanstack/react-query";
import type { ConversationState, ConversationChannelType } from "@workspace/ai-conversation";
import { useAuth } from "@/context/auth-context";
import { useConversationServices } from "@/lib/ai-conversation";

export type ConversationListFilters = {
  state?: ConversationState;
  channelType?: ConversationChannelType;
  assignedUserId?: string | null;
  hasEmployeeUnread?: boolean;
  searchQuery?: string;
};

export function conversationListQueryKey(companyId: string | null, filters: ConversationListFilters) {
  return ["conversation-list", companyId, filters] as const;
}

export function useConversationList(filters: ConversationListFilters = {}) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { services, context } = useConversationServices();

  return useQuery({
    queryKey: conversationListQueryKey(companyId, filters),
    enabled: Boolean(companyId),
    staleTime: 15_000,
    queryFn: async () => {
      if (!companyId) return [];
      return services.conversations.listConversations(context, {
        companyId,
        limit: 100,
        ...filters,
      });
    },
  });
}
