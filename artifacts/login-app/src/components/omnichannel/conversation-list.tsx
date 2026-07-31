import { memo, useCallback, useRef, useState } from "react";
import { ConversationItem } from "@/components/omnichannel/conversation-item";
import { DashboardCard } from "@/components/dashboard/ui";
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
    <DashboardCard className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-white/5 p-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      </div>
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
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardCard>
  );
});
