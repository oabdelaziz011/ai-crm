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
  const followLatestRef = useRef(true);
  const previousMessageIdsRef = useRef<readonly string[]>([]);
  const previousScrollHeightRef = useRef(0);
  const previousScrollTopRef = useRef(0);
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
    followLatestRef.current = true;
    previousScrollHeightRef.current = node.scrollHeight;
    previousScrollTopRef.current = node.scrollTop;
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
    const node = scrollContainerRef.current;
    if (!node) return;
    const movedUp = node.scrollTop + 8 < previousScrollTopRef.current;
    const heightGrew = node.scrollHeight > previousScrollHeightRef.current + 1;
    previousScrollTopRef.current = node.scrollTop;
    previousScrollHeightRef.current = node.scrollHeight;
    if (movedUp) {
      followLatestRef.current = false;
      isNearBottomRef.current = false;
      return;
    }
    if (heightGrew && followLatestRef.current) {
      scrollNodeToBottom(node);
      isNearBottomRef.current = true;
      previousScrollTopRef.current = node.scrollTop;
      previousScrollHeightRef.current = node.scrollHeight;
      setHasNewMessages(false);
      return;
    }
    const near = readNearBottom();
    isNearBottomRef.current = near;
    followLatestRef.current = near;
    if (near) {
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
    followLatestRef.current = true;
    setHasNewMessages(false);
  }, [conversationId]);

  useEffect(() => {
    const node = scrollContainerRef.current;
    if (!node) return;

    const pinToLatestIfFollowing = () => {
      if (pendingInitialScrollRef.current) return;
      if (!followLatestRef.current) return;
      scrollNodeToBottom(node);
      isNearBottomRef.current = true;
      previousScrollHeightRef.current = node.scrollHeight;
      previousScrollTopRef.current = node.scrollTop;
    };

    const resizeObserver = new ResizeObserver(pinToLatestIfFollowing);
    resizeObserver.observe(node);
    const observeSpacer = () => {
      const spacer = node.firstElementChild;
      if (spacer) resizeObserver.observe(spacer);
    };
    observeSpacer();
    const mutationObserver = new MutationObserver(observeSpacer);
    mutationObserver.observe(node, { childList: true });
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [conversationId, messageIds.length]);

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
      if (followLatestRef.current) {
        scrollAfterRender(scrollToBottom);
      } else {
        setHasNewMessages(true);
      }
      previousMessageIdsRef.current = messageIds;
      return;
    }

    if (change === "replace") {
      // Refetch / React Query replace must NOT yank the viewport back to bottom
      // (or an old unread position). Only stick to bottom when already near it.
      if (followLatestRef.current) {
        scrollAfterRender(scrollToBottom);
      }
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
