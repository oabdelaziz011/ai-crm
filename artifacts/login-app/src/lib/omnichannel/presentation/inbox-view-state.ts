import type { UnifiedConversation } from "@/lib/omnichannel/types/unified-conversation";
import { traceReorderStage } from "@/lib/omnichannel/debug/omni-reorder-audit";

/** Unread count acknowledged when the agent opened the conversation (presentation-only). */
export type InboxAcknowledgedUnread = ReadonlyMap<string, number>;

export function effectiveInboxUnreadCount(
  conversation: UnifiedConversation,
  acknowledged: InboxAcknowledgedUnread,
): number {
  const baseline = acknowledged.get(conversation.id);
  if (baseline === undefined) return conversation.unreadCount;
  if (conversation.unreadCount <= baseline) return 0;
  return conversation.unreadCount - baseline;
}

export function applyInboxViewState(
  conversations: UnifiedConversation[],
  acknowledged: InboxAcknowledgedUnread,
): UnifiedConversation[] {
  if (acknowledged.size === 0) {
    traceReorderStage({
      stage: "applyInboxViewState",
      file: "inbox-view-state.ts",
      function: "applyInboxViewState",
      line: 16,
      before: conversations,
      after: conversations,
      arrayReferenceChanged: false,
      sortCalled: false,
      extra: { acknowledgedCount: 0, noop: true },
    });
    return conversations;
  }
  const result = conversations.map((conversation) => {
    const unreadCount = effectiveInboxUnreadCount(conversation, acknowledged);
    if (unreadCount === conversation.unreadCount) return conversation;
    return { ...conversation, unreadCount };
  });
  traceReorderStage({
    stage: "applyInboxViewState",
    file: "inbox-view-state.ts",
    function: "applyInboxViewState",
    line: 16,
    before: conversations,
    after: result,
    arrayReferenceChanged: result !== conversations,
    sortCalled: false,
    extra: { acknowledgedCount: acknowledged.size },
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
