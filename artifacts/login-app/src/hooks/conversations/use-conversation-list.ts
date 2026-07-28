import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { ConversationState, ConversationChannelType } from "@workspace/ai-conversation";
import { useAuth } from "@/context/auth-context";
import { CONVERSATION_LIST_PAGE_SIZE } from "@/lib/crm/crm-list-config";
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

export function useConversationList(
  filters: ConversationListFilters = {},
  pageSize = CONVERSATION_LIST_PAGE_SIZE,
) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { services, context } = useConversationServices();

  return useQuery({
    queryKey: [...conversationListQueryKey(companyId, filters), "bounded", pageSize],
    enabled: Boolean(companyId),
    staleTime: 15_000,
    queryFn: async () => {
      if (!companyId) return [];
      return services.conversations.listConversations(context, {
        companyId,
        limit: pageSize,
        offset: 0,
        ...filters,
      });
    },
  });
}

export function useConversationListInfinite(
  filters: ConversationListFilters = {},
  pageSize = CONVERSATION_LIST_PAGE_SIZE,
) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { services, context } = useConversationServices();

  return useInfiniteQuery({
    queryKey: [...conversationListQueryKey(companyId, filters), "infinite", pageSize],
    enabled: Boolean(companyId),
    staleTime: 15_000,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      if (!companyId) {
        return { rows: [], nextOffset: null };
      }
      const rows = await services.conversations.listConversations(context, {
        companyId,
        limit: pageSize,
        offset: pageParam,
        ...filters,
      });
      return {
        rows,
        nextOffset: rows.length < pageSize ? null : pageParam + pageSize,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
  });
}
