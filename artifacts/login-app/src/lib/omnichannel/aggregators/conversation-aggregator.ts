import type { ConversationRecord } from "@workspace/ai-conversation";
import type { LifecycleState } from "@/lib/conversation-lifecycle/types/lifecycle-types";
import {
  getActiveEscalation,
  resolveConversationOwner,
  resolveLifecycleState,
} from "@/lib/conversation-lifecycle";
import type {
  OmnichannelAgentRef,
  OmnichannelChannelKey,
  OmnichannelCustomerRef,
  OmnichannelListFilters,
  UnifiedConversation,
} from "@/lib/omnichannel/types/unified-conversation";
import { isPrimaryOmnichannelChannel } from "@/lib/omnichannel/types/unified-conversation";
import type { ConversationOwnershipLabels } from "@/lib/omnichannel/presentation/conversation-ownership";
import {
  hasConversationAssignee,
  resolveAssignedToUserId,
  resolveConversationOwnership,
} from "@/lib/omnichannel/presentation/conversation-ownership";
import type { Profile } from "@/lib/types";
import { captureSortStackTrace, traceReorderStage } from "@/lib/omnichannel/debug/omni-reorder-audit";

export type ConversationAggregationInput = {
  conversations: ConversationRecord[];
  customersById: ReadonlyMap<string, OmnichannelCustomerRef>;
  agentsById: ReadonlyMap<string, OmnichannelAgentRef>;
  profilesByUserId?: ReadonlyMap<string, Profile>;
  channelLabels?: Partial<Record<OmnichannelChannelKey, string>>;
  ownershipLabels?: ConversationOwnershipLabels;
};

function readBooleanMetadata(metadata: Record<string, unknown>, key: string): boolean {
  return metadata[key] === true;
}

function resolveHandlerModeFromLifecycle(
  lifecycleState: LifecycleState,
  backendState: ConversationRecord["state"],
): UnifiedConversation["handlerMode"] {
  if (backendState === "waiting_api") return "mixed";
  if (lifecycleState === "AI_HANDLING" || lifecycleState === "NEW") return "ai";
  if (
    lifecycleState === "ASSIGNED"
    || lifecycleState === "ESCALATED"
    || lifecycleState === "PENDING_CUSTOMER"
    || lifecycleState === "PENDING_INTERNAL"
    || lifecycleState === "WAITING_QUEUE"
    || lifecycleState === "REOPENED"
  ) {
    return "human";
  }
  return "ai";
}

function resolveLifecycleFields(conversation: ConversationRecord) {
  const isEscalated = getActiveEscalation(conversation.metadata) != null;
  const lifecycleState = resolveLifecycleState({
    conversationId: conversation.id,
    backendState: conversation.state,
    assignedUserId: conversation.assigned_user_id,
    aiAssistantId: conversation.ai_assistant_id,
    metadata: conversation.metadata,
    hasActiveEscalation: isEscalated,
    lastParticipantType: conversation.last_participant_type,
  });
  const owner = resolveConversationOwner({
    conversationId: conversation.id,
    backendState: conversation.state,
    assignedUserId: conversation.assigned_user_id,
    aiAssistantId: conversation.ai_assistant_id,
    metadata: conversation.metadata,
    hasActiveEscalation: isEscalated,
    lastParticipantType: conversation.last_participant_type,
  });
  return {
    lifecycleState,
    isEscalated,
    ownerLabel: owner.label,
    handlerMode: resolveHandlerModeFromLifecycle(lifecycleState, conversation.state),
  };
}

function resolveChannelLabel(
  channel: OmnichannelChannelKey,
  labels?: Partial<Record<OmnichannelChannelKey, string>>,
): string {
  return labels?.[channel] ?? channel.replace(/_/g, " ");
}

export class ConversationAggregator {
  aggregateConversation(
    conversation: ConversationRecord,
    customersById: ReadonlyMap<string, OmnichannelCustomerRef>,
    agentsById: ReadonlyMap<string, OmnichannelAgentRef>,
    channelLabels?: Partial<Record<OmnichannelChannelKey, string>>,
    profilesByUserId: ReadonlyMap<string, Profile> = new Map(),
    ownershipLabels: ConversationOwnershipLabels = { aiEmployee: "AI Employee", unassigned: "Unassigned" },
  ): UnifiedConversation {
    const customer = conversation.customer_id
      ? customersById.get(conversation.customer_id) ?? null
      : null;
    const assignedAgent = conversation.assigned_user_id
      ? agentsById.get(conversation.assigned_user_id) ?? null
      : null;

    const lifecycle = resolveLifecycleFields(conversation);

    const draft: UnifiedConversation = {
      id: conversation.id,
      companyId: conversation.company_id,
      customer,
      channel: conversation.channel_type,
      channelLabel: resolveChannelLabel(conversation.channel_type, channelLabels),
      lastMessage: conversation.last_message_preview,
      lastActivityAt: conversation.last_message_at ?? conversation.updated_at,
      assignedAgent,
      handlerMode: lifecycle.handlerMode,
      lifecycleState: lifecycle.lifecycleState,
      isEscalated: lifecycle.isEscalated,
      ownerLabel: lifecycle.ownerLabel,
      ownershipTier: "unassigned",
      assignedToUserId: null,
      priority: conversation.priority,
      status: conversation.state,
      unreadCount: conversation.unread_count_employee,
      isPinned: readBooleanMetadata(conversation.metadata, "pinned"),
      isArchived: readBooleanMetadata(conversation.metadata, "archived"),
      conversationNumber: conversation.conversation_number,
      companyChannelId: conversation.company_channel_id,
      externalThreadId: conversation.external_thread_id,
      source: conversation,
    };

    const ownership = resolveConversationOwnership(
      draft,
      agentsById,
      profilesByUserId,
      ownershipLabels,
    );

    return {
      ...draft,
      ownerLabel: ownership.displayName,
      ownershipTier: ownership.tier,
      assignedToUserId: ownership.assigneeUserId,
    };
  }

  aggregateList(input: ConversationAggregationInput): UnifiedConversation[] {
    const profilesByUserId = input.profilesByUserId ?? new Map();
    const ownershipLabels = input.ownershipLabels ?? { aiEmployee: "AI Employee", unassigned: "Unassigned" };
    const result = input.conversations.map((conversation) =>
      this.aggregateConversation(
        conversation,
        input.customersById,
        input.agentsById,
        input.channelLabels,
        profilesByUserId,
        ownershipLabels,
      ),
    );
    traceReorderStage({
      stage: "aggregateList",
      file: "conversation-aggregator.ts",
      function: "aggregateList",
      line: 150,
      before: input.conversations,
      after: result,
      arrayReferenceChanged: true,
      sortCalled: false,
    });
    return result;
  }

  mergeByCustomer(aggregated: UnifiedConversation[]): UnifiedConversation[] {
    const byCustomer = new Map<string, UnifiedConversation>();

    for (const conversation of aggregated) {
      const key = conversation.customer?.id ?? conversation.id;
      const existing = byCustomer.get(key);
      if (!existing) {
        byCustomer.set(key, conversation);
        continue;
      }

      const existingActivity = existing.lastActivityAt ? Date.parse(existing.lastActivityAt) : 0;
      const nextActivity = conversation.lastActivityAt ? Date.parse(conversation.lastActivityAt) : 0;
      if (nextActivity >= existingActivity) {
        byCustomer.set(key, {
          ...conversation,
          unreadCount: existing.unreadCount + conversation.unreadCount,
        });
      } else {
        byCustomer.set(key, {
          ...existing,
          unreadCount: existing.unreadCount + conversation.unreadCount,
        });
      }
    }

    return [...byCustomer.values()];
  }

  applyFilters(
    conversations: UnifiedConversation[],
    filters: OmnichannelListFilters,
  ): UnifiedConversation[] {
    const inputSnapshot = conversations;
    let result = [...conversations];

    if (filters.archived === true) {
      result = result.filter((item) => item.isArchived);
    } else if (filters.archived === false) {
      result = result.filter((item) => !item.isArchived);
    }

    if (filters.pinnedOnly) {
      result = result.filter((item) => item.isPinned);
    }

    if (filters.unreadOnly) {
      result = result.filter((item) => item.unreadCount > 0);
    }

    if (filters.channel) {
      result = result.filter((item) => item.channel === filters.channel);
    }

    if (filters.status) {
      result = result.filter((item) => item.status === filters.status);
    }

    if (filters.priority) {
      result = result.filter((item) => item.priority === filters.priority);
    }

    if (filters.assignedUserId) {
      result = result.filter((item) => resolveAssignedToUserId(item) === filters.assignedUserId);
    }

    if (filters.assignedOnly) {
      result = result.filter((item) => hasConversationAssignee(item));
    }

    if (filters.handlerMode && filters.handlerMode !== "all") {
      result = result.filter((item) => item.handlerMode === filters.handlerMode);
    }

    if (filters.tag?.trim()) {
      const tag = filters.tag.trim().toLowerCase();
      result = result.filter((item) => {
        const tags = item.source.metadata?.tags;
        if (!Array.isArray(tags)) return false;
        return tags.some((entry) => String(entry).toLowerCase() === tag);
      });
    }

    if (filters.search?.trim()) {
      const query = filters.search.trim().toLowerCase();
      result = result.filter((item) => {
        const haystack = [
          item.customer?.name,
          item.customer?.phone,
          item.customer?.email,
          item.lastMessage,
          item.channelLabel,
          item.conversationNumber,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      });
    }

    traceReorderStage({
      stage: "applyFilters.filter",
      file: "conversation-aggregator.ts",
      function: "applyFilters",
      line: 198,
      before: inputSnapshot,
      after: result,
      arrayReferenceChanged: true,
      sortCalled: false,
      extra: { filters },
    });

    const beforeSort = [...result];
    const sortBy = filters.sortBy ?? "last_activity";
    const sortDirection = filters.sortDirection ?? "desc";
    const comparator =
      sortBy === "priority"
        ? `priorityRank(${sortDirection}, pinnedFirst)`
        : sortBy === "unread"
          ? `unreadCount(${sortDirection}, pinnedFirst)`
          : `lastActivityAt(${sortDirection}, pinnedFirst)`;
    const stackTrace = captureSortStackTrace();

    result.sort((left, right) => {
      if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1;

      const direction = filters.sortDirection === "asc" ? -1 : 1;
      if (filters.sortBy === "priority") {
        const rank = { urgent: 4, high: 3, normal: 2, low: 1 } as const;
        return (rank[right.priority] - rank[left.priority]) * direction;
      }
      if (filters.sortBy === "unread") {
        return (right.unreadCount - left.unreadCount) * direction;
      }

      const leftTime = left.lastActivityAt ? Date.parse(left.lastActivityAt) : 0;
      const rightTime = right.lastActivityAt ? Date.parse(right.lastActivityAt) : 0;
      return (rightTime - leftTime) * direction;
    });

    traceReorderStage({
      stage: "applyFilters.sort",
      file: "conversation-aggregator.ts",
      function: "applyFilters",
      line: 265,
      before: beforeSort,
      after: result,
      arrayReferenceChanged: true,
      sortCalled: true,
      comparator,
      stackTrace,
      extra: { sortBy, sortDirection, pinnedFirst: true },
    });

    return result;
  }

  filterBySupportedChannels(conversations: UnifiedConversation[]): UnifiedConversation[] {
    const result = conversations.filter((item) => isPrimaryOmnichannelChannel(item.channel));
    traceReorderStage({
      stage: "filterBySupportedChannels",
      file: "conversation-aggregator.ts",
      function: "filterBySupportedChannels",
      line: 286,
      before: conversations,
      after: result,
      arrayReferenceChanged: true,
      sortCalled: false,
    });
    return result;
  }
}

export const conversationAggregator = new ConversationAggregator();
