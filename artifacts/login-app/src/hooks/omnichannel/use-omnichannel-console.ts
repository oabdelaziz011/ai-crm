import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePermissions } from "@/hooks/use-rbac";
import { useAuth } from "@/context/auth-context";
import { useConversationListInfinite } from "@/hooks/conversations/use-conversation-list";
import { useConversationMessages } from "@/hooks/conversations/use-conversation-messages";
import { useConversationActions } from "@/hooks/conversations/use-conversation-actions";
import { useTeamInboxReply } from "@/hooks/conversations/use-team-inbox-reply";
import { useCustomersEnrichment } from "@/hooks/use-customers";
import { useProfiles } from "@/hooks/use-profiles";
import { conversationAggregator } from "@/lib/omnichannel/aggregators/conversation-aggregator";
import { mapUnifiedMessages } from "@/lib/omnichannel/aggregators/message-mapper";
import { buildAiAssistModel } from "@/lib/omnichannel/services/ai-assist-service";
import { applyConversationQueue } from "@/lib/omnichannel/services/conversation-queues";
import { OMNICHANNEL_LIST_STALE_MS } from "@/lib/omnichannel/cache/query-keys";
import type { OmnichannelListFilters } from "@/lib/omnichannel/types/unified-conversation";
import {
  canViewOmnichannelConsole,
  filterConversationsByChannelPermission,
} from "@/lib/omnichannel/permissions";
import { OMNICHANNEL_PRIMARY_CHANNELS } from "@/lib/omnichannel/types/unified-conversation";
import { useConversationRealtime, useOmnichannelAccess } from "@/hooks/omnichannel/use-conversation-realtime";
import { fetchOmnichannelCustomerContext } from "@/lib/omnichannel/services/omnichannel-customer-context-service";
import { omnichannelCustomerContextKey } from "@/lib/omnichannel/cache/query-keys";

function mapListFilters(filters: OmnichannelListFilters) {
  return {
    searchQuery: filters.search,
    channelType: filters.channel,
    state: filters.status,
    assignedUserId: filters.assignedUserId,
    hasEmployeeUnread: filters.unreadOnly,
  };
}

export function useOmnichannelConsole(filters: OmnichannelListFilters, selectedId: string | null) {
  const access = useOmnichannelAccess();
  const { user } = useAuth();
  const companyId = access?.companyId ?? null;
  const canView = canViewOmnichannelConsole(access);

  const listQuery = useConversationListInfinite(mapListFilters(filters));
  const flatConversations = useMemo(
    () => listQuery.data?.pages.flatMap((page) => page.rows) ?? [],
    [listQuery.data?.pages],
  );

  const { data: customers = [] } = useCustomersEnrichment();
  const { data: profiles = [] } = useProfiles();

  const customersById = useMemo(
    () =>
      new Map(
        customers.map((customer) => [
          customer.id,
          {
            id: customer.id,
            name: customer.name,
            phone: customer.phone ?? null,
            email: customer.email ?? null,
          },
        ]),
      ),
    [customers],
  );

  const agentsById = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const profile of profiles) {
      if (!profile.user_id) continue;
      map.set(profile.user_id, {
        id: profile.user_id,
        name: profile.full_name?.trim() || profile.email || profile.user_id,
      });
    }
    return map;
  }, [profiles]);

  const aggregated = useMemo(() => {
    if (!access) return [];
    const unified = conversationAggregator.aggregateList({
      conversations: flatConversations,
      customersById,
      agentsById,
    });
    const supported = conversationAggregator.filterBySupportedChannels(unified);
    const filtered = conversationAggregator.applyFilters(supported, filters);
    return applyConversationQueue(filtered, filters.queue, user?.id);
  }, [flatConversations, customersById, agentsById, filters, access, user?.id]);

  const visibleConversations = useMemo(
    () => filterConversationsByChannelPermission(aggregated, OMNICHANNEL_PRIMARY_CHANNELS),
    [aggregated],
  );

  const selectedConversation =
    visibleConversations.find((conversation) => conversation.id === selectedId)
    ?? visibleConversations[0]
    ?? null;

  const messagesQuery = useConversationMessages(selectedConversation?.id ?? null);
  const unifiedMessages = useMemo(
    () =>
      selectedConversation
        ? mapUnifiedMessages(messagesQuery.data ?? [], selectedConversation.channel)
        : [],
    [messagesQuery.data, selectedConversation],
  );

  const aiAssist = useMemo(
    () => buildAiAssistModel(messagesQuery.data ?? []),
    [messagesQuery.data],
  );

  useConversationRealtime(companyId, selectedConversation?.id ?? null);

  const { assign, release, close } = useConversationActions(companyId);
  const { sendReply, isSending, error: sendError } = useTeamInboxReply(companyId);

  return {
    access,
    canView,
    companyId,
    conversations: visibleConversations,
    selectedConversation,
    messages: unifiedMessages,
    aiAssist,
    agentsById,
    profiles,
    listQuery,
    messagesQuery,
    assign,
    release,
    close,
    sendReply,
    isSending,
    sendError,
  };
}

export function useOmnichannelCustomerContext(customerId: string | null) {
  const { profile, user, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();

  return useQuery({
    queryKey: omnichannelCustomerContextKey(customerId),
    enabled: Boolean(customerId && profile?.company_id),
    staleTime: OMNICHANNEL_LIST_STALE_MS,
    queryFn: async () => {
      if (!customerId || !profile?.company_id) {
        return {
          customer: null,
          openTickets: 0,
          recentBookings: 0,
          outstandingInvoices: 0,
          timelinePreview: [] as string[],
          knowledgeSuggestions: [] as string[],
          recentAiActions: [] as string[],
        };
      }

      return fetchOmnichannelCustomerContext({
        customerId,
        companyId: profile.company_id,
        access: {
          companyId: profile.company_id,
          userId: user?.id ?? "",
          isSuperAdmin: Boolean(isSuperAdmin),
          hasPermission,
        },
      });
    },
  });
}
