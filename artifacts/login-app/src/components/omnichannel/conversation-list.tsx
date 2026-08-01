import { memo, useCallback, useRef, useState } from "react";
import { ConversationItem } from "@/components/omnichannel/conversation-item";
import { OmnichannelPanel, OmnichannelPanelHeader } from "@/components/omnichannel/omnichannel-panel";
import {
  computeConversationListWindow,
  OMNICHANNEL_LIST_ROW_HEIGHT,
} from "@/lib/omnichannel/virtualization/conversation-list-window";
import type { UnifiedConversation } from "@/lib/omnichannel/types/unified-conversation";

type ConversationListProps = {
  title: string;
  subtitle: string;
  conversations: UnifiedConversation[];
  selectedId: string | null;
  isLoading: boolean;
  emptyLabel: string;
  loadingLabel: string;
  unknownContactLabel: string;
  noPreviewLabel: string;
  aiLabel: string;
  humanLabel: string;
  onSelect: (conversationId: string) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  getOwnerLabel?: (conversation: UnifiedConversation) => string | null;
  isEscalated?: (conversationId: string) => boolean;
  escalatedLabel?: string;
};

export const ConversationList = memo(function ConversationList({
  title,
  subtitle,
  conversations,
  selectedId,
  isLoading,
  emptyLabel,
  loadingLabel,
  unknownContactLabel,
  noPreviewLabel,
  aiLabel,
  humanLabel,
  onSelect,
  onLoadMore,
  hasMore,
  getOwnerLabel,
  isEscalated,
  escalatedLabel,
}: ConversationListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(640);

  const window = computeConversationListWindow(conversations.length, scrollTop, viewportHeight);
  const visible = conversations.slice(window.startIndex, window.endIndex);

  const handleScroll = useCallback(() => {
    const node = containerRef.current;
    if (!node) return;
    setScrollTop(node.scrollTop);
    setViewportHeight(node.clientHeight);
    if (hasMore && onLoadMore && node.scrollTop + node.clientHeight >= node.scrollHeight - 120) {
      onLoadMore();
    }
  }, [hasMore, onLoadMore]);

  return (
    <OmnichannelPanel className="h-full">
      <OmnichannelPanelHeader title={title} subtitle={subtitle} />
      <div ref={containerRef} className="flex-1 overflow-y-auto" onScroll={handleScroll}>
        {isLoading ? <p className="p-4 text-sm text-muted-foreground">{loadingLabel}</p> : null}
        {!isLoading && conversations.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
        ) : null}
        <div style={{ height: window.totalHeight, position: "relative" }}>
          <div style={{ transform: `translateY(${window.offsetY}px)` }}>
            {visible.map((conversation) => (
              <div key={conversation.id} style={{ height: OMNICHANNEL_LIST_ROW_HEIGHT }}>
                <ConversationItem
                  conversation={conversation}
                  active={conversation.id === selectedId}
                  onSelect={onSelect}
                  unknownContactLabel={unknownContactLabel}
                  noPreviewLabel={noPreviewLabel}
                  aiLabel={aiLabel}
                  humanLabel={humanLabel}
                  ownerLabel={conversation.ownerLabel ?? getOwnerLabel?.(conversation) ?? null}
                  escalated={conversation.isEscalated || (isEscalated?.(conversation.id) ?? false)}
                  escalatedLabel={escalatedLabel}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </OmnichannelPanel>
  );
});
