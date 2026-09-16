import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { PermissionDeniedError } from "@workspace/ai-conversation";
import { useAuth } from "@/context/auth-context";
import { useCompanyPermissionAuth } from "@/hooks/billing/use-company-permission-auth";
import { useConversationServices } from "@/lib/ai-conversation";
import {
  CUSTOMER_EMAIL_PAGE_SIZE,
  canViewCustomerEmailTab,
  customerEmailConversationsQueryKey,
  listCustomerEmailConversations,
  listCustomerEmailThreadMessages,
} from "@/lib/customer-workspace/customer-email-timeline";

export function useCustomerEmailConversations(customerId: string | null | undefined) {
  const { profile, isSuperAdmin } = useAuth();
  const { hasCompanyPermission } = useCompanyPermissionAuth();
  const companyId = profile?.company_id ?? null;
  const { services, context } = useConversationServices();
  const canView = canViewCustomerEmailTab({
    isSuperAdmin,
    hasPermission: hasCompanyPermission,
  });
  const id = customerId?.trim() || null;

  return useInfiniteQuery({
    queryKey: [...customerEmailConversationsQueryKey(companyId, id), "infinite", CUSTOMER_EMAIL_PAGE_SIZE],
    enabled: Boolean(companyId && id && canView),
    staleTime: 0,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      if (!companyId || !id || !canView) {
        return { rows: [], nextOffset: null as number | null };
      }
      try {
        const rows = await listCustomerEmailConversations({
          ctx: context,
          conversations: services.conversations,
          companyId,
          customerId: id,
          limit: CUSTOMER_EMAIL_PAGE_SIZE,
          offset: pageParam,
        });
        return {
          rows,
          nextOffset: rows.length === CUSTOMER_EMAIL_PAGE_SIZE ? pageParam + rows.length : null,
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

export function useCustomerEmailThreadMessages(
  conversationId: string | null,
  enabled: boolean,
) {
  const { isSuperAdmin } = useAuth();
  const { hasCompanyPermission } = useCompanyPermissionAuth();
  const { services, context } = useConversationServices();
  const canView = canViewCustomerEmailTab({
    isSuperAdmin,
    hasPermission: hasCompanyPermission,
  });
  const id = conversationId?.trim() || null;

  return useQuery({
    queryKey: ["conversation-messages", id],
    enabled: Boolean(id && enabled && canView),
    staleTime: 0,
    queryFn: async () => {
      if (!id || !canView) return [];
      return listCustomerEmailThreadMessages({
        ctx: context,
        messages: services.messages,
        conversationId: id,
      });
    },
  });
}
