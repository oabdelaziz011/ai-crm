import { useCallback, useEffect, useState } from "react";
import type { UnifiedConversation } from "@/lib/omnichannel/types/unified-conversation";
import {
  acknowledgeConversationUnread,
  applyInboxViewState,
  syncAcknowledgedUnreadBaselines,
} from "@/lib/omnichannel/presentation/inbox-view-state";

export function useInboxViewState(
  trackedConversations: UnifiedConversation[],
  initialSelectedId: string | null,
) {
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
    (conversations: UnifiedConversation[]) => applyInboxViewState(conversations, acknowledgedUnread),
    [acknowledgedUnread],
  );

  const markConversationViewed = useCallback((conversation: UnifiedConversation | null | undefined) => {
    if (!conversation) return;
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
  };
}
