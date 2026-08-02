import { useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { usePermissions } from "@/hooks/use-rbac";
import { useAuth } from "@/context/auth-context";
import { useAiAssistantSettings } from "@/hooks/use-ai-assistant-settings";
import { useConversationListInfinite } from "@/hooks/conversations/use-conversation-list";
import { useConversationMessages } from "@/hooks/conversations/use-conversation-messages";
import { auditTranscriptMessagesFromRecords } from "@/lib/omnichannel/debug/omni-transcript-messages-audit";
import { useConversationActions } from "@/hooks/conversations/use-conversation-actions";
import { useTeamInboxReply } from "@/hooks/conversations/use-team-inbox-reply";
import { useCustomersEnrichment } from "@/hooks/use-customers";
import { useProfiles } from "@/hooks/use-profiles";
import { conversationAggregator } from "@/lib/omnichannel/aggregators/conversation-aggregator";
import { mapUnifiedMessages } from "@/lib/omnichannel/aggregators/message-mapper";
import { buildAiAssistModel } from "@/lib/omnichannel/services/ai-assist-service";
import { resolveAgentWorkspaceLanguage, resolveProfileComposerLanguage } from "@/lib/omnichannel/services/conversation-language-detector";
import { resolveContactDisplayName } from "@/lib/omnichannel/presentation/contact-display";
import { buildContactDisplayInput } from "@/lib/omnichannel/presentation/conversation-contact-identity";
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
import { auditRenderPipeline, omniRenderTrace } from "@/lib/omnichannel/debug/omni-render-audit";
import { auditOmniListPipeline } from "@/lib/omnichannel/debug/omni-list-pipeline-audit";
import { traceDomRenderStage } from "@/lib/omnichannel/debug/omni-dom-render-audit";
import { traceReorderStage } from "@/lib/omnichannel/debug/omni-reorder-audit";

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
  const { i18n, t } = useTranslation();
  const access = useOmnichannelAccess();
  const { user, profile } = useAuth();
  const companyId = access?.companyId ?? null;
  const canView = canViewOmnichannelConsole(access);
  const { data: aiAssistantSettings } = useAiAssistantSettings(companyId);

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

  const profilesByUserId = useMemo(() => {
    const map = new Map<string, (typeof profiles)[number]>();
    for (const profile of profiles) {
      if (profile.user_id) map.set(profile.user_id, profile);
    }
    return map;
  }, [profiles]);

  const ownershipLabels = useMemo(
    () => ({
      aiEmployee: t("omnichannel.assignment.aiEmployee"),
      unassigned: t("omnichannel.customer.unassigned"),
    }),
    [t],
  );

  const aggregated = useMemo(() => {
    if (!access) return [];
    const unified = conversationAggregator.aggregateList({
      conversations: flatConversations,
      customersById,
      agentsById,
      profilesByUserId,
      ownershipLabels,
    });
    const supported = conversationAggregator.filterBySupportedChannels(unified);
    const filtered = conversationAggregator.applyFilters(supported, filters);
    const effectiveQueue = filters.queue ?? "all";
    return applyConversationQueue(filtered, effectiveQueue, user?.id);
  }, [flatConversations, customersById, agentsById, profilesByUserId, filters, access, user?.id, ownershipLabels]);

  const visibleConversations = useMemo(() => {
    const result = filterConversationsByChannelPermission(aggregated, OMNICHANNEL_PRIMARY_CHANNELS);
    traceReorderStage({
      stage: "useOmnichannelConsole.visibleConversations",
      file: "use-omnichannel-console.ts",
      function: "useOmnichannelConsole",
      line: 136,
      before: aggregated,
      after: result,
      arrayReferenceChanged: true,
      sortCalled: false,
    });
    return result;
  }, [aggregated]);

  const inboxConversations = useMemo(() => {
    if (!access) return [];
    const unified = conversationAggregator.aggregateList({
      conversations: flatConversations,
      customersById,
      agentsById,
      profilesByUserId,
      ownershipLabels,
    });
    const supported = conversationAggregator.filterBySupportedChannels(unified);
    return filterConversationsByChannelPermission(
      conversationAggregator.applyFilters(supported, filters),
      OMNICHANNEL_PRIMARY_CHANNELS,
    );
  }, [flatConversations, customersById, agentsById, profilesByUserId, filters, access, ownershipLabels]);

  const selectedConversation =
    visibleConversations.find((conversation) => conversation.id === selectedId)
    ?? visibleConversations[0]
    ?? null;

  useEffect(() => {
    if (!access || listQuery.isLoading) return;
    auditRenderPipeline({
      stage: "useOmnichannelConsole",
      flatRows: flatConversations,
      filters,
      userId: user?.id,
      customersById,
      agentsById,
      profilesByUserId,
      ownershipLabels,
    });
    auditOmniListPipeline({
      flatRows: flatConversations,
      filters,
      userId: user?.id,
      customersById,
      agentsById,
      profilesByUserId,
      ownershipLabels,
    });
    traceReorderStage({
      stage: "reactQuery.flatMap",
      file: "use-omnichannel-console.ts",
      function: "pages.flatMap",
      line: 54,
      before: flatConversations,
      after: flatConversations,
      arrayReferenceChanged: false,
      sortCalled: false,
      extra: { pageCount: listQuery.data?.pages.length ?? 0 },
    });
    omniRenderTrace("useOmnichannelConsole.visibleConversations", visibleConversations, {
      selectedQueue: filters.queue ?? "all",
      activeFilters: filters,
    });
    traceDomRenderStage({
      stage: "useOmnichannelConsole.visibleConversations",
      file: "use-omnichannel-console.ts",
      function: "useOmnichannelConsole",
      line: 135,
      rows: visibleConversations,
      extra: { selectedQueue: filters.queue ?? "all" },
    });
    traceDomRenderStage({
      stage: "useOmnichannelConsole.selectedConversation",
      file: "use-omnichannel-console.ts",
      function: "useOmnichannelConsole",
      line: 183,
      rows: selectedConversation ? [selectedConversation] : [],
      previousPresent: visibleConversations.some((c) => c.id === selectedConversation?.id),
      extra: {
        selectedId,
        selectedConversationId: selectedConversation?.id ?? null,
        selectedConversationNumber: selectedConversation?.conversationNumber ?? null,
      },
    });
    omniRenderTrace("useOmnichannelConsole.inboxConversations", inboxConversations, {
      note: "used for nav counts, not InboxColumn",
    });
  }, [
    access,
    flatConversations,
    filters,
    user?.id,
    customersById,
    agentsById,
    profilesByUserId,
    ownershipLabels,
    visibleConversations,
    inboxConversations,
    listQuery.isLoading,
    selectedConversation,
    selectedId,
  ]);

  const customerContextQuery = useOmnichannelCustomerContext(selectedConversation?.customer?.id ?? null);

  const messagesQuery = useConversationMessages(selectedConversation?.id ?? null);
  const unifiedMessages = useMemo(
    () => {
      if (!selectedConversation) return [];
      const customerLabel = resolveContactDisplayName(
        buildContactDisplayInput(selectedConversation, selectedConversation.customer, "Visitor"),
      );
      const mapped = mapUnifiedMessages(
        messagesQuery.data ?? [],
        selectedConversation.channel,
        { customer: customerLabel },
        profilesByUserId,
        "Support Agent",
      );
      auditTranscriptMessagesFromRecords(
        selectedConversation.id,
        mapped.map((message) => ({
          id: message.id,
          created_at: message.timestamp,
          message_type: message.senderType,
          content: message.body,
        })),
        {
          stage: "useOmnichannelConsole.unifiedMessages.mapped",
          file: "use-omnichannel-console.ts",
          function: "useOmnichannelConsole",
          line: 242,
          queryKey: ["conversation-messages", selectedConversation.id],
          extra: { sourceRowCount: messagesQuery.data?.length ?? 0 },
        },
      );
      return mapped;
    },
    [messagesQuery.data, selectedConversation, profilesByUserId],
  );

  const aiAssist = useMemo(() => {
    const workspaceLanguage = resolveAgentWorkspaceLanguage(i18n.language);
    const agentComposerLanguage = resolveProfileComposerLanguage(profile?.preferred_language);
    const companyDefaultLanguage =
      aiAssistantSettings?.language === "ar" || aiAssistantSettings?.language === "en"
        ? aiAssistantSettings.language
        : null;

    return buildAiAssistModel(messagesQuery.data ?? [], customerContextQuery.data?.knowledgeSuggestions ?? [], {
      metadata: selectedConversation?.source.metadata,
      workspaceLanguage,
      agentComposerLanguage,
      companyDefaultLanguage,
      lifecycleState: selectedConversation?.lifecycleState,
      customerContext: customerContextQuery.data ?? null,
    });
  }, [
    messagesQuery.data,
    selectedConversation?.source.metadata,
    selectedConversation?.lifecycleState,
    i18n.language,
    profile?.preferred_language,
    aiAssistantSettings?.language,
    customerContextQuery.data,
  ]);

  useConversationRealtime(companyId, selectedConversation?.id ?? null);

  const { assign, release, close } = useConversationActions(companyId);
  const { sendReply, isSending, error: sendError, clearError: clearSendError } = useTeamInboxReply(companyId);

  return {
    access,
    canView,
    companyId,
    flatRowCount: flatConversations.length,
    conversations: visibleConversations,
    inboxConversations,
    selectedConversation,
    messages: unifiedMessages,
    aiAssist,
    agentsById,
    profilesByUserId,
    profiles,
    listQuery,
    messagesQuery,
    assign,
    release,
    close,
    sendReply,
    isSending,
    sendError,
    clearSendError,
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
