import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { PermissionDeniedError } from "@workspace/ai-conversation";
import { useAuth } from "@/context/auth-context";
import { useCompanyPermissionAuth } from "@/hooks/billing/use-company-permission-auth";
import { useCommercialFeatureLookup } from "@/hooks/billing/use-commercial-feature-lookup";
import { useConversationServices } from "@/lib/ai-conversation";
import {
  CUSTOMER_SMS_COMMERCIAL_FEATURE,
  CUSTOMER_SMS_PAGE_SIZE,
  canViewCustomerSmsTab,
  customerSmsConversationsQueryKey,
  listCustomerSmsConversations,
  listCustomerSmsThreadMessages,
} from "@/lib/customer-workspace/customer-sms-timeline";

function useCustomerSmsTabGate() {
  const { isSuperAdmin } = useAuth();
  const { hasCompanyPermission } = useCompanyPermissionAuth();
  const { lookup, isResolved } = useCommercialFeatureLookup();
  const entitled = isSuperAdmin
    ? true
    : isResolved
      ? lookup(CUSTOMER_SMS_COMMERCIAL_FEATURE) === true
      : false;
  const canView = canViewCustomerSmsTab({
    isSuperAdmin,
    hasPermission: hasCompanyPermission,
    smsChannelEntitled: entitled,
  });
  return { canView, smsChannelEntitled: entitled };
}

export function useCustomerSmsConversations(customerId: string | null | undefined) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { services, context } = useConversationServices();
  const { canView, smsChannelEntitled } = useCustomerSmsTabGate();
  const id = customerId?.trim() || null;

  return useInfiniteQuery({
    queryKey: [...customerSmsConversationsQueryKey(companyId, id), "infinite", CUSTOMER_SMS_PAGE_SIZE],
    enabled: Boolean(companyId && id && canView),
    staleTime: 0,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      if (!companyId || !id || !canView) {
        return { rows: [], nextOffset: null as number | null };
      }
      try {
        const rows = await listCustomerSmsConversations({
          ctx: context,
          conversations: services.conversations,
          companyId,
          customerId: id,
          smsChannelEntitled,
          limit: CUSTOMER_SMS_PAGE_SIZE,
          offset: pageParam,
        });
        return {
          rows,
          nextOffset: rows.length === CUSTOMER_SMS_PAGE_SIZE ? pageParam + rows.length : null,
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

export function useCustomerSmsThreadMessages(conversationId: string | null, enabled: boolean) {
  const { services, context } = useConversationServices();
  const { canView, smsChannelEntitled } = useCustomerSmsTabGate();
  const id = conversationId?.trim() || null;

  return useQuery({
    queryKey: ["conversation-messages", id, "customer-sms"],
    enabled: Boolean(id && enabled && canView),
    staleTime: 0,
    queryFn: async () => {
      if (!id || !canView) return [];
      return listCustomerSmsThreadMessages({
        ctx: context,
        messages: services.messages,
        conversationId: id,
        smsChannelEntitled,
      });
    },
  });
}
