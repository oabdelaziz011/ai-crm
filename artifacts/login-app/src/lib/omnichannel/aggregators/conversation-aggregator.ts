import type { ConversationRecord } from "@workspace/ai-conversation";
import type {
  OmnichannelAgentRef,
  OmnichannelChannelKey,
  OmnichannelCustomerRef,
  OmnichannelListFilters,
  UnifiedConversation,
} from "@/lib/omnichannel/types/unified-conversation";
import { isPrimaryOmnichannelChannel } from "@/lib/omnichannel/types/unified-conversation";

export type ConversationAggregationInput = {
  conversations: ConversationRecord[];
  customersById: ReadonlyMap<string, OmnichannelCustomerRef>;
  agentsById: ReadonlyMap<string, OmnichannelAgentRef>;
  channelLabels?: Partial<Record<OmnichannelChannelKey, string>>;
};

function readBooleanMetadata(metadata: Record<string, unknown>, key: string): boolean {
  return metadata[key] === true;
}

function resolveHandlerMode(conversation: ConversationRecord): UnifiedConversation["handlerMode"] {
  if (conversation.state === "transferred_to_human" || conversation.assigned_user_id) return "human";
  if (conversation.state === "waiting_api") return "mixed";
  return "ai";
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
  ): UnifiedConversation {
    const customer = conversation.customer_id
      ? customersById.get(conversation.customer_id) ?? null
      : null;
    const assignedAgent = conversation.assigned_user_id
      ? agentsById.get(conversation.assigned_user_id) ?? null
      : null;

    return {
      id: conversation.id,
      companyId: conversation.company_id,
      customer,
      channel: conversation.channel_type,
      channelLabel: resolveChannelLabel(conversation.channel_type, channelLabels),
      lastMessage: conversation.last_message_preview,
      lastActivityAt: conversation.last_message_at ?? conversation.updated_at,
      assignedAgent,
      handlerMode: resolveHandlerMode(conversation),
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
  }

  aggregateList(input: ConversationAggregationInput): UnifiedConversation[] {
    return input.conversations.map((conversation) =>
      this.aggregateConversation(
        conversation,
        input.customersById,
        input.agentsById,
        input.channelLabels,
      ),
    );
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
      result = result.filter((item) => item.assignedAgent?.id === filters.assignedUserId);
    }

    if (filters.handlerMode && filters.handlerMode !== "all") {
      result = result.filter((item) => item.handlerMode === filters.handlerMode);
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

    result.sort((left, right) => {
      if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1;

      const direction = filters.sortDirection === "asc" ? 1 : -1;
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

    return result;
  }

  filterBySupportedChannels(conversations: UnifiedConversation[]): UnifiedConversation[] {
    return conversations.filter((item) => isPrimaryOmnichannelChannel(item.channel));
  }
}

export const conversationAggregator = new ConversationAggregator();
