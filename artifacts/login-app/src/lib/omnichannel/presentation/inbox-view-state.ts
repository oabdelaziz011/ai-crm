import type { UnifiedConversation } from "@/lib/omnichannel/types/unified-conversation";
import { traceReorderStage } from "@/lib/omnichannel/debug/omni-reorder-audit";

/** Unread count acknowledged when the agent opened the conversation (presentation-only). */
export type InboxAcknowledgedUnread = ReadonlyMap<string, number>;

/** Visual attention for inbox rows — New takes priority over Unread over Read. */
export type ConversationAttention = "new" | "unread" | "read";

const ATTENTION_RANK: Record<ConversationAttention, number> = {
  new: 0,
  unread: 1,
  read: 2,
};

export function effectiveInboxUnreadCount(
  conversation: UnifiedConversation,
  acknowledged: InboxAcknowledgedUnread,
): number {
  const baseline = acknowledged.get(conversation.id);
  if (baseline === undefined) return conversation.unreadCount;
  if (conversation.unreadCount <= baseline) return 0;
  return conversation.unreadCount - baseline;
}

export function resolveConversationAttention(input: {
  unreadCount: number;
  hasBeenOpened: boolean;
  active?: boolean;
  markedUnread?: boolean;
}): ConversationAttention {
  if (input.active) return "read";
  const hasUnread = input.unreadCount > 0;
  if (!hasUnread && !input.markedUnread) return "read";
  if (hasUnread && !input.hasBeenOpened) return "new";
  return "unread";
}

export function conversationAttentionRank(attention: ConversationAttention): number {
  return ATTENTION_RANK[attention];
}

/**
 * Stable sort: New → Unread → Read, preserving relative order within each tier.
 * Uses existing unread counts + opened set; does not invent a second unread source.
 */
export function sortConversationsByAttention(
  conversations: UnifiedConversation[],
  openedIds: ReadonlySet<string>,
  activeId?: string | null,
): UnifiedConversation[] {
  if (conversations.length < 2) return conversations;

  const ranked = conversations.map((conversation, index) => {
    const attention = resolveConversationAttention({
      unreadCount: conversation.unreadCount,
      hasBeenOpened: openedIds.has(conversation.id),
      active: activeId != null && conversation.id === activeId,
    });
    return { conversation, index, rank: ATTENTION_RANK[attention] };
  });

  let reordered = false;
  for (let i = 1; i < ranked.length; i += 1) {
    if (ranked[i]!.rank < ranked[i - 1]!.rank) {
      reordered = true;
      break;
    }
  }
  if (!reordered) return conversations;

  ranked.sort((left, right) => {
    if (left.conversation.isPinned !== right.conversation.isPinned) {
      return left.conversation.isPinned ? -1 : 1;
    }
    return left.rank - right.rank || left.index - right.index;
  });
  return ranked.map((entry) => entry.conversation);
}

export function applyInboxViewState(
  conversations: UnifiedConversation[],
  acknowledged: InboxAcknowledgedUnread,
  options?: {
    openedIds?: ReadonlySet<string>;
    activeId?: string | null;
    sortByAttention?: boolean;
  },
): UnifiedConversation[] {
  let result = conversations;
  let unreadAdjusted = false;

  if (acknowledged.size > 0) {
    result = conversations.map((conversation) => {
      const unreadCount = effectiveInboxUnreadCount(conversation, acknowledged);
      if (unreadCount === conversation.unreadCount) return conversation;
      unreadAdjusted = true;
      return { ...conversation, unreadCount };
    });
  }

  let sorted = false;
  if (options?.sortByAttention !== false && options?.openedIds) {
    const next = sortConversationsByAttention(result, options.openedIds, options.activeId);
    sorted = next !== result;
    result = next;
  }

  if (!unreadAdjusted && !sorted) {
    traceReorderStage({
      stage: "applyInboxViewState",
      file: "inbox-view-state.ts",
      function: "applyInboxViewState",
      line: 16,
      before: conversations,
      after: conversations,
      arrayReferenceChanged: false,
      sortCalled: false,
      extra: { acknowledgedCount: acknowledged.size, noop: true },
    });
    return conversations;
  }

  traceReorderStage({
    stage: "applyInboxViewState",
    file: "inbox-view-state.ts",
    function: "applyInboxViewState",
    line: 16,
    before: conversations,
    after: result,
    arrayReferenceChanged: result !== conversations,
    sortCalled: sorted,
    extra: { acknowledgedCount: acknowledged.size, sortedByAttention: sorted },
  });
  return result;
}

export function acknowledgeConversationUnread(
  current: Map<string, number>,
  conversation: UnifiedConversation,
): Map<string, number> {
  if (current.get(conversation.id) === conversation.unreadCount) return current;
  const next = new Map(current);
  next.set(conversation.id, conversation.unreadCount);
  return next;
}

/** Lower baselines when the server reports fewer unreads (sync completed). */
export function syncAcknowledgedUnreadBaselines(
  current: Map<string, number>,
  conversations: UnifiedConversation[],
): Map<string, number> {
  if (current.size === 0) return current;
  let changed = false;
  const next = new Map(current);
  for (const conversation of conversations) {
    const baseline = next.get(conversation.id);
    if (baseline === undefined) continue;
    if (conversation.unreadCount < baseline) {
      next.set(conversation.id, conversation.unreadCount);
      changed = true;
    }
  }
  return changed ? next : current;
}
