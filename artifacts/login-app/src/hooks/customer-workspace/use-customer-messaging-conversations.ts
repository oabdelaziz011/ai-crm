import { useInfiniteQuery } from "@tanstack/react-query";
import { PermissionDeniedError } from "@workspace/ai-conversation";
import { useAuth } from "@/context/auth-context";
import { useConversationServices } from "@/lib/ai-conversation";
import {
  CUSTOMER_MESSAGING_PAGE_SIZE,
  customerMessagingConversationsQueryKey,
  listCustomerMessagingConversations,
} from "@/lib/customer-workspace/customer-messaging-timeline";

export function useCustomerMessagingConversations(customerId: string | null | undefined) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { services, context } = useConversationServices();
  const id = customerId?.trim() || null;
  const canView = Boolean(context.hasPermission("conversations.view") || context.isSuperAdmin);

  return useInfiniteQuery({
    queryKey: [
      ...customerMessagingConversationsQueryKey(companyId, id),
      "infinite",
      CUSTOMER_MESSAGING_PAGE_SIZE,
    ],
    enabled: Boolean(companyId && id && canView),
    staleTime: 0,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      if (!companyId || !id || !canView) {
        return { rows: [], nextOffset: null as number | null };
      }
      try {
        const rows = await listCustomerMessagingConversations({
          ctx: context,
          conversations: services.conversations,
          companyId,
          customerId: id,
          limit: CUSTOMER_MESSAGING_PAGE_SIZE,
          offset: pageParam,
        });
        return {
          rows,
          nextOffset: rows.length === CUSTOMER_MESSAGING_PAGE_SIZE ? pageParam + rows.length : null,
        };
      } catch (error) {
        if (error instanceof PermissionDeniedError) {
          return { rows: [], nextOffset: null as number | null };
        }
        throw error;
      }
    },
    getNextPageParam: (last) => last.nextOffset,
  });
}
