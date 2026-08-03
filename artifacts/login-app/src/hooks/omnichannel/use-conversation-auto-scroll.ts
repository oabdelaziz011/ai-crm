import { useCallback, useEffect, useRef, useState } from "react";
import {
  CONVERSATION_NEAR_BOTTOM_THRESHOLD_PX,
  detectMessageListChange,
  isNearScrollBottom,
} from "@/hooks/omnichannel/conversation-auto-scroll-logic";

type UseConversationAutoScrollOptions = {
  conversationId: string | null;
  messageIds: readonly string[];
  isHistoryLoading?: boolean;
};

export type ConversationAutoScrollController = {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  scrollToBottom: () => void;
  scrollToMessage: (messageId: string) => void;
  onMessageSent: () => void;
  hasNewMessages: boolean;
  jumpToLatest: () => void;
};

function scrollNodeToBottom(node: HTMLDivElement) {
  node.scrollTop = node.scrollHeight;
}

function scrollAfterRender(scrollToBottom: () => void) {
  requestAnimationFrame(() => {
    requestAnimationFrame(scrollToBottom);
  });
}

export function useConversationAutoScroll({
  conversationId,
  messageIds,
  isHistoryLoading = false,
}: UseConversationAutoScrollOptions): ConversationAutoScrollController {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);
  const previousMessageIdsRef = useRef<readonly string[]>([]);
  const previousScrollHeightRef = useRef(0);
  const pendingInitialScrollRef = useRef(false);
  const [hasNewMessages, setHasNewMessages] = useState(false);

  const readNearBottom = useCallback(() => {
    const node = scrollContainerRef.current;
    if (!node) return true;
    return isNearScrollBottom(node.scrollTop, node.scrollHeight, node.clientHeight);
  }, []);

  const scrollToBottom = useCallback(() => {
    const node = scrollContainerRef.current;
    if (!node) return;
    scrollNodeToBottom(node);
    isNearBottomRef.current = true;
    setHasNewMessages(false);
  }, []);

  const scrollToMessage = useCallback((messageId: string) => {
    const node = scrollContainerRef.current;
    if (!node) return;
    const target = node.querySelector(`[data-message-id="${messageId}"]`);
    target?.scrollIntoView({ block: "center" });
    isNearBottomRef.current = readNearBottom();
    if (isNearBottomRef.current) {
      setHasNewMessages(false);
    }
  }, [readNearBottom]);

  const onScroll = useCallback(() => {
    isNearBottomRef.current = readNearBottom();
    if (isNearBottomRef.current) {
      setHasNewMessages(false);
    }
  }, [readNearBottom]);

  const onMessageSent = useCallback(() => {
    scrollAfterRender(scrollToBottom);
  }, [scrollToBottom]);

  const jumpToLatest = useCallback(() => {
    scrollAfterRender(scrollToBottom);
  }, [scrollToBottom]);

  useEffect(() => {
    previousMessageIdsRef.current = [];
    pendingInitialScrollRef.current = true;
    isNearBottomRef.current = true;
    setHasNewMessages(false);
  }, [conversationId]);

  useEffect(() => {
    if (isHistoryLoading) {
      const node = scrollContainerRef.current;
      if (node) {
        previousScrollHeightRef.current = node.scrollHeight;
      }
    }
  }, [isHistoryLoading]);

  useEffect(() => {
    const previousIds = previousMessageIdsRef.current;
    const change = detectMessageListChange(previousIds, messageIds);

    if (change === "none") {
      return;
    }

    if (pendingInitialScrollRef.current && messageIds.length > 0) {
      pendingInitialScrollRef.current = false;
      scrollAfterRender(scrollToBottom);
      previousMessageIdsRef.current = messageIds;
      return;
    }

    if (change === "prepend" || isHistoryLoading) {
      const node = scrollContainerRef.current;
      if (node && previousScrollHeightRef.current > 0) {
        const delta = node.scrollHeight - previousScrollHeightRef.current;
        if (delta > 0) {
          node.scrollTop += delta;
        }
      }
      previousScrollHeightRef.current = scrollContainerRef.current?.scrollHeight ?? 0;
      previousMessageIdsRef.current = messageIds;
      return;
    }

    if (change === "append") {
      if (isNearBottomRef.current) {
        scrollAfterRender(scrollToBottom);
      } else {
        setHasNewMessages(true);
      }
      previousMessageIdsRef.current = messageIds;
      return;
    }

    if (change === "replace") {
      scrollAfterRender(scrollToBottom);
      previousMessageIdsRef.current = messageIds;
    }
  }, [isHistoryLoading, messageIds, scrollToBottom]);

  return {
    scrollContainerRef,
    onScroll,
    scrollToBottom,
    scrollToMessage,
    onMessageSent,
    hasNewMessages,
    jumpToLatest,
  };
}

export { CONVERSATION_NEAR_BOTTOM_THRESHOLD_PX };
