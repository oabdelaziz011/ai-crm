import { memo, useCallback, useRef, useState } from "react";
import { GripVertical, X } from "lucide-react";
import { QueueCard, AGENT_DESK_QUEUE_ROW_HEIGHT } from "@/components/omnichannel/agent-desk/queue-line";
import { DeskEmptyState } from "@/components/omnichannel/agent-desk/desk-empty-state";
import { computeConversationListWindow } from "@/lib/omnichannel/virtualization/conversation-list-window";
import type { AgentDeskLabels } from "@/components/omnichannel/types/workspace-labels";
import type { UnifiedConversation } from "@/lib/omnichannel/types/unified-conversation";

type QueuePanelProps = {
  open: boolean;
  width: number;
  onClose: () => void;
  onResize: (width: number) => void;
  conversations: UnifiedConversation[];
  selectedId: string | null;
  isLoading: boolean;
  hasMore: boolean;
  onSelect: (id: string) => void;
  onLoadMore: () => void;
  onClearFilters?: () => void;
  title: string;
  deskLabels: AgentDeskLabels;
  labels: {
    empty: string;
    emptyHint?: string;
    loading: string;
    visitorLabel: string;
    noPreview: string;
    aiEmployee: string;
    unassigned: string;
    open: string;
    pin?: string;
    star?: string;
    markUnread?: string;
    follow?: string;
  };
};

export const QueuePanel = memo(function QueuePanel({
  open,
  width,
  onClose,
  onResize,
  conversations,
  selectedId,
  isLoading,
  hasMore,
  onSelect,
  onLoadMore,
  onClearFilters,
  title,
  deskLabels,
  labels,
}: QueuePanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const handleScroll = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    setScrollTop(node.scrollTop);
    setViewportHeight(node.clientHeight);
    if (hasMore && node.scrollTop + node.clientHeight >= node.scrollHeight - 80) {
      onLoadMore();
    }
  }, [hasMore, onLoadMore]);

  const startResize = useCallback(
    (event: React.PointerEvent) => {
      dragRef.current = { startX: event.clientX, startWidth: width };
      (event.target as HTMLElement).setPointerCapture(event.pointerId);
    },
    [width],
  );

  const moveResize = useCallback(
    (event: React.PointerEvent) => {
      if (!dragRef.current) return;
      const delta = event.clientX - dragRef.current.startX;
      onResize(dragRef.current.startWidth + delta);
    },
    [onResize],
  );

  const endResize = useCallback(() => {
    dragRef.current = null;
  }, []);

  if (!open) return null;

  const window = computeConversationListWindow(
    conversations.length,
    scrollTop,
    viewportHeight,
    AGENT_DESK_QUEUE_ROW_HEIGHT,
  );
  const visible = conversations.slice(window.startIndex, window.endIndex);

  return (
    <aside
      aria-label={deskLabels.conversationQueue}
      className="relative flex shrink-0 flex-col border-e border-[var(--ad-border)] bg-[var(--ad-surface)]"
      style={{ width }}
    >
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--ad-border-subtle)] px-2.5 py-2">
        <div className="min-w-0">
          <p className="text-[9px] uppercase tracking-widest text-[var(--ad-text-muted)]">{deskLabels.inbox}</p>
          <h2 className="truncate text-sm font-semibold">{title}</h2>
        </div>
        <button type="button" className="agent-desk-btn agent-desk-btn--ghost p-1.5" onClick={onClose} aria-label={deskLabels.close}>
          <X className="size-4" />
        </button>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto py-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ad-accent)]/40"
        onScroll={handleScroll}
        role="listbox"
        tabIndex={0}
        aria-activedescendant={selectedId ?? undefined}
      >
        {isLoading ? <p className="p-3 text-xs text-[var(--ad-text-muted)]">{labels.loading}</p> : null}
        {!isLoading && conversations.length === 0 ? (
          <DeskEmptyState
            variant="queue"
            title={labels.empty}
            description={labels.emptyHint ?? deskLabels.adjustFiltersHint}
            actionLabel={deskLabels.emptySecondary.queue}
            onAction={onClearFilters}
            secondaryActionLabel={deskLabels.close}
            onSecondaryAction={onClose}
          />
        ) : (
          <div style={{ height: window.totalHeight, position: "relative" }}>
            <div style={{ transform: `translateY(${window.offsetY}px)` }}>
              {visible.map((conversation, offset) => {
                const index = window.startIndex + offset;
                return (
                  <QueueCard
                    key={conversation.id}
                    conversation={conversation}
                    active={conversation.id === selectedId}
                    index={index}
                    onSelect={(id) => onSelect(id)}
                    ownerLabel={conversation.ownerLabel}
                    ownershipTier={conversation.ownershipTier}
                    unreadOverflowLabel={deskLabels.unreadOverflow}
                    labels={labels}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        aria-label={deskLabels.resizeQueue}
        className="absolute inset-y-0 -end-1 z-10 flex w-2 cursor-col-resize items-center justify-center text-[var(--ad-text-muted)] hover:text-[var(--ad-accent)]"
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
      >
        <GripVertical className="size-3 opacity-60" />
      </button>
    </aside>
  );
});
