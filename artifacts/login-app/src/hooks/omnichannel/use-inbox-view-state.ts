import { useCallback, useEffect, useState } from "react";
import type { UnifiedConversation } from "@/lib/omnichannel/types/unified-conversation";
import {
  getOpenedConversationIds,
  markConversationOpened,
} from "@/lib/omnichannel/presentation/conversation-experience-storage";
import {
  acknowledgeConversationUnread,
  applyInboxViewState,
  syncAcknowledgedUnreadBaselines,
} from "@/lib/omnichannel/presentation/inbox-view-state";

export function useInboxViewState(
  trackedConversations: UnifiedConversation[],
  initialSelectedId: string | null,
  activeId?: string | null,
) {
  const [openedIds, setOpenedIds] = useState<Set<string>>(() => {
    const initial = getOpenedConversationIds();
    if (initialSelectedId) {
      markConversationOpened(initialSelectedId);
      initial.add(initialSelectedId);
    }
    return initial;
  });

  const [acknowledgedUnread, setAcknowledgedUnread] = useState<Map<string, number>>(() => {
    const initial = new Map<string, number>();
    if (initialSelectedId) {
      const match = trackedConversations.find((c) => c.id === initialSelectedId);
      if (match) initial.set(match.id, match.unreadCount);
    }
    return initial;
  });

  useEffect(() => {
    setAcknowledgedUnread((current) => syncAcknowledgedUnreadBaselines(current, trackedConversations));
  }, [trackedConversations]);

  const applyViewState = useCallback(
    (conversations: UnifiedConversation[]) =>
      // Keep list order stable on open/read — aggregator reorders only on activity.
      applyInboxViewState(conversations, acknowledgedUnread, {
        openedIds,
        activeId: activeId ?? null,
        sortByAttention: false,
      }),
    [acknowledgedUnread, openedIds, activeId],
  );

  const markConversationViewed = useCallback((conversation: UnifiedConversation | null | undefined) => {
    if (!conversation) return;
    markConversationOpened(conversation.id);
    setOpenedIds((current) => {
      if (current.has(conversation.id)) return current;
      const next = new Set(current);
      next.add(conversation.id);
      return next;
    });
    setAcknowledgedUnread((current) => acknowledgeConversationUnread(current, conversation));
  }, []);

  const markConversationViewedById = useCallback(
    (conversationId: string, conversations: UnifiedConversation[]) => {
      const match = conversations.find((c) => c.id === conversationId);
      markConversationViewed(match);
    },
    [markConversationViewed],
  );

  return {
    applyViewState,
    markConversationViewed,
    markConversationViewedById,
    openedIds,
  };
}
