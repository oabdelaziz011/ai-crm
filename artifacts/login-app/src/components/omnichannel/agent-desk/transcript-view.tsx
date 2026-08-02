import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { format, isSameDay } from "date-fns";
import type { MessageStatus } from "@workspace/ai-conversation";
import type { OutboundDeliveryPhase } from "@/lib/omnichannel/services/outbound-delivery";
import {
  TranscriptLine,
  estimateTranscriptRowHeight,
  type MessageGroupPosition,
} from "@/components/omnichannel/agent-desk/transcript-line";
import { TypingIndicator } from "@/components/omnichannel/agent-desk/typing-indicator";
import { TranscriptSearchBar } from "@/components/omnichannel/agent-desk/transcript-search-bar";
import { DeskEmptyState } from "@/components/omnichannel/agent-desk/desk-empty-state";
import { computeVariableListWindow } from "@/lib/omnichannel/virtualization/message-list-window";
import { firstLinkPreview } from "@/lib/omnichannel/presentation/link-preview";
import type { SmartTimeLabels } from "@/lib/omnichannel/presentation/smart-time";
import { channelSupportsAttachments, channelSupportsReactions } from "@/lib/omnichannel/presentation/channel-capabilities";
import type { OmnichannelChannelKey, UnifiedMessage } from "@/lib/omnichannel/types/unified-conversation";
import type { ResolvedConversationLanguage } from "@/lib/omnichannel/services/conversation-language-detector";
import { shouldOfferMessageTranslation } from "@/lib/omnichannel/services/message-translation-display";
import {
  createPendingAttachment,
  AttachmentPreviewStrip,
  revokePendingAttachment,
  type PendingAttachment,
} from "@/components/omnichannel/agent-desk/attachment-preview-strip";
import { findSearchMatches } from "@/hooks/omnichannel/use-conversation-experience";
import type { TypingActor } from "@/hooks/omnichannel/use-conversation-experience";

export type TranscriptViewHandle = {
  scrollToBottom: () => void;
  scrollToMessage: (messageId: string) => void;
};

type TranscriptViewProps = {
  messages: UnifiedMessage[];
  channel: OmnichannelChannelKey;
  emptyLabel: string;
  emptyHint: string;
  todayLabel: string;
  voiceLabel: string;
  aiLabel: string;
  conversationLanguage?: ResolvedConversationLanguage;
  agentLanguage?: ResolvedConversationLanguage;
  translationLabels?: { original: string; translated: string };
  deliveryLabels?: Partial<Record<MessageStatus | OutboundDeliveryPhase, string>>;
  smartTimeLabels: SmartTimeLabels;
  searchQuery?: string;
  onSearchQueryChange?: (value: string) => void;
  searchLabels?: {
    placeholder: string;
    previous: string;
    next: string;
    clear: string;
    bookmarks: string;
    noMatches: string;
  };
  activeMatchIndex?: number;
  onNextMatch?: () => void;
  onPreviousMatch?: () => void;
  bookmarksOnly?: boolean;
  onToggleBookmarks?: () => void;
  starredIds?: Set<string>;
  onToggleStar?: (messageId: string) => void;
  getReaction?: (messageId: string) => string | null;
  onReaction?: (messageId: string, emoji: string | null) => void;
  typingActor?: TypingActor;
  typingLabels?: { customer: string; agent: string; ai: string };
  starLabel?: string;
  attachmentPreviewLabel?: string;
  attachmentLabels?: {
    download: string;
    openFullscreen: string;
    closeFullscreen: string;
  };
  onPasteImage?: (file: File) => void;
  onFocusComposer?: () => void;
  focusComposerLabel?: string;
};

type Row =
  | { kind: "day"; key: string; label: string; height: number }
  | {
      kind: "message";
      key: string;
      message: UnifiedMessage;
      showMeta: boolean;
      groupPosition: MessageGroupPosition;
      height: number;
    };

export const TranscriptView = memo(
  forwardRef<TranscriptViewHandle, TranscriptViewProps>(function TranscriptView(
    {
      messages,
      channel,
      emptyLabel,
      emptyHint,
      todayLabel,
      voiceLabel,
      aiLabel,
      conversationLanguage = "en",
      agentLanguage = "en",
      translationLabels = { original: "Original", translated: "Translated" },
      deliveryLabels = {},
      smartTimeLabels,
      searchQuery = "",
      onSearchQueryChange,
      searchLabels,
      activeMatchIndex = 0,
      onNextMatch,
      onPreviousMatch,
      bookmarksOnly,
      onToggleBookmarks,
      starredIds,
      onToggleStar,
      getReaction,
      onReaction,
      typingActor,
      typingLabels,
      starLabel,
      attachmentPreviewLabel = "Preview only — upload API not connected",
      attachmentLabels,
      onPasteImage,
      onFocusComposer,
      focusComposerLabel,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(480);
    const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);

    const visibleMessages = useMemo(() => {
      const filtered = messages.filter((message) => !message.isInternalNote);
      if (!bookmarksOnly || !starredIds?.size) return filtered;
      return filtered.filter((message) => starredIds.has(message.id));
    }, [messages, bookmarksOnly, starredIds]);

    const matchIds = useMemo(
      () => findSearchMatches(visibleMessages, searchQuery),
      [visibleMessages, searchQuery],
    );
    const activeMatchId = matchIds[activeMatchIndex] ?? null;

    const scrollToBottom = useCallback(() => {
      const node = containerRef.current;
      if (!node) return;
      node.scrollTop = node.scrollHeight;
      setScrollTop(node.scrollTop);
    }, []);

    const scrollToMessage = useCallback((messageId: string) => {
      const node = containerRef.current;
      if (!node) return;
      const target = node.querySelector(`[data-message-id="${messageId}"]`);
      target?.scrollIntoView({ block: "center" });
    }, []);

    useImperativeHandle(ref, () => ({ scrollToBottom, scrollToMessage }), [scrollToBottom, scrollToMessage]);

    const rows = useMemo(
      () => flattenMessages(visibleMessages, todayLabel, conversationLanguage, agentLanguage),
      [visibleMessages, todayLabel, conversationLanguage, agentLanguage],
    );

    const heights = useMemo(() => rows.map((row) => row.height), [rows]);
    const window = computeVariableListWindow(heights, scrollTop, viewportHeight);
    const visible = rows.slice(window.startIndex, window.endIndex);

    useEffect(() => {
      scrollToBottom();
    }, [messages.length, scrollToBottom]);

    useEffect(() => {
      if (activeMatchId) scrollToMessage(activeMatchId);
    }, [activeMatchId, scrollToMessage]);

    const handleScroll = useCallback(() => {
      const node = containerRef.current;
      if (!node) return;
      setScrollTop(node.scrollTop);
      setViewportHeight(node.clientHeight);
    }, []);

    const addFiles = useCallback((files: FileList | File[]) => {
      const next = [...files].map((file) => createPendingAttachment(file));
      setPendingAttachments((current) => [...current, ...next]);
      if (next[0]?.file.type.startsWith("image/")) onPasteImage?.(next[0].file);
    }, [onPasteImage]);

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent) => {
        const messageRows = rows.filter((row): row is Extract<Row, { kind: "message" }> => row.kind === "message");
        if (messageRows.length === 0) return;

        if (event.key === "Home") {
          event.preventDefault();
          setFocusedRowIndex(0);
          scrollToMessage(messageRows[0]!.message.id);
        } else if (event.key === "End") {
          event.preventDefault();
          const last = messageRows.length - 1;
          setFocusedRowIndex(last);
          scrollToMessage(messageRows[last]!.message.id);
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          setFocusedRowIndex((current) => {
            const next = Math.min(messageRows.length - 1, (current ?? -1) + 1);
            scrollToMessage(messageRows[next]!.message.id);
            return next;
          });
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          setFocusedRowIndex((current) => {
            const next = Math.max(0, (current ?? messageRows.length) - 1);
            scrollToMessage(messageRows[next]!.message.id);
            return next;
          });
        } else if (event.key === "PageDown") {
          event.preventDefault();
          containerRef.current && (containerRef.current.scrollTop += viewportHeight * 0.85);
        } else if (event.key === "PageUp") {
          event.preventDefault();
          containerRef.current && (containerRef.current.scrollTop -= viewportHeight * 0.85);
        }
      },
      [rows, scrollToMessage, viewportHeight],
    );

    const typingLabel =
      typingActor === "customer"
        ? typingLabels?.customer
        : typingActor === "agent"
          ? typingLabels?.agent
          : typingActor === "ai"
            ? typingLabels?.ai
            : null;

    if (rows.length === 0 && !searchQuery && !bookmarksOnly) {
      return (
        <DeskEmptyState
          variant="transcript"
          title={emptyLabel}
          description={emptyHint}
          actionLabel={focusComposerLabel}
          onAction={onFocusComposer}
        />
      );
    }

    return (
      <div className="flex h-full min-h-0 flex-col">
        {searchLabels && onSearchQueryChange ? (
          <TranscriptSearchBar
            query={searchQuery}
            onQueryChange={onSearchQueryChange}
            matchCount={matchIds.length}
            activeIndex={activeMatchIndex}
            onNext={() => onNextMatch?.()}
            onPrevious={() => onPreviousMatch?.()}
            onClear={() => onSearchQueryChange("")}
            onToggleBookmarks={onToggleBookmarks}
            bookmarksOnly={bookmarksOnly}
            labels={searchLabels}
          />
        ) : null}

        <AttachmentPreviewStrip
          attachments={pendingAttachments}
          uploadUnavailableLabel={attachmentPreviewLabel}
          onRemove={(id) => {
            setPendingAttachments((current) => {
              const removed = current.find((entry) => entry.id === id);
              if (removed) revokePendingAttachment(removed);
              return current.filter((entry) => entry.id !== id);
            });
          }}
          onRetry={(id) => {
            setPendingAttachments((current) =>
              current.map((entry) => (entry.id === id ? { ...entry, status: "ready" } : entry)),
            );
          }}
        />

        <div
          ref={containerRef}
          className={`agent-desk__grid-bg min-h-0 flex-1 overflow-y-auto px-2 py-3 sm:px-3 ${dragOver ? "ring-2 ring-inset ring-[var(--ad-accent)]/30" : ""}`}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          onDragOver={(event) => {
            if (!channelSupportsAttachments(channel)) return;
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            if (!channelSupportsAttachments(channel) || !event.dataTransfer.files.length) return;
            addFiles(event.dataTransfer.files);
          }}
          onPaste={(event) => {
            const file = [...event.clipboardData.items]
              .find((item) => item.type.startsWith("image/"))
              ?.getAsFile();
            if (!file) return;
            event.preventDefault();
            addFiles([file]);
          }}
          role="log"
          aria-live="polite"
          tabIndex={0}
        >
          <div className="mx-auto w-full max-w-[94%]" style={{ height: window.totalHeight, position: "relative" }}>
            <div style={{ transform: `translateY(${window.offsetY}px)` }}>
              {visible.map((row, index) => (
                <div key={row.key} style={{ minHeight: row.height }}>
                  {row.kind === "day" ? (
                    <div className="my-2 flex justify-center py-1">
                      <span className="rounded-full bg-[var(--ad-surface-2)]/80 px-3 py-1 text-[10px] font-medium text-[var(--ad-text-muted)]" dir="auto">
                        {row.label}
                      </span>
                    </div>
                  ) : (
                    <TranscriptLine
                      message={row.message}
                      channel={channel}
                      showMeta={row.showMeta}
                      groupPosition={row.groupPosition}
                      conversationLanguage={conversationLanguage}
                      agentLanguage={agentLanguage}
                      translationLabels={translationLabels}
                      voiceLabel={voiceLabel}
                      aiLabel={aiLabel}
                      deliveryLabels={deliveryLabels}
                      smartTimeLabels={smartTimeLabels}
                      searchQuery={searchQuery}
                      isSearchActive={row.message.id === activeMatchId}
                      isStarred={starredIds?.has(row.message.id)}
                      onToggleStar={onToggleStar ? () => onToggleStar(row.message.id) : undefined}
                      reaction={getReaction?.(row.message.id) ?? null}
                      onReaction={onReaction ? (emoji) => onReaction(row.message.id, emoji) : undefined}
                      reactionsEnabled={channelSupportsReactions(channel)}
                      starLabel={starLabel}
                      attachmentLabels={attachmentLabels}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {typingLabel ? <TypingIndicator label={typingLabel} /> : null}
      </div>
    );
  }),
);

function senderGroupKey(message: UnifiedMessage): string {
  return `${message.senderType}:${message.senderLabel}:${message.isInternalNote ? "note" : "msg"}`;
}

function flattenMessages(
  messages: UnifiedMessage[],
  todayLabel: string,
  conversationLanguage: ResolvedConversationLanguage,
  agentLanguage: ResolvedConversationLanguage,
): Row[] {
  const rows: Row[] = [];
  let lastDay = "";

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]!;
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const day = format(new Date(message.timestamp), "yyyy-MM-dd");
    const groupKey = senderGroupKey(message);

    if (day !== lastDay) {
      lastDay = day;
      rows.push({
        kind: "day",
        key: `day-${day}`,
        label: isSameDay(new Date(message.timestamp), new Date())
          ? todayLabel
          : format(new Date(message.timestamp), "MMM d, yyyy"),
        height: estimateTranscriptRowHeight({ kind: "day" }),
      });
    }

    const sameGroupAsPrev =
      prev && senderGroupKey(prev) === groupKey && format(new Date(prev.timestamp), "yyyy-MM-dd") === day;
    const sameGroupAsNext =
      next && senderGroupKey(next) === groupKey && format(new Date(next.timestamp), "yyyy-MM-dd") === day;

    const showMeta = !sameGroupAsPrev;
    let groupPosition: MessageGroupPosition = "single";
    if (sameGroupAsPrev && sameGroupAsNext) groupPosition = "middle";
    else if (sameGroupAsPrev) groupPosition = "last";
    else if (sameGroupAsNext) groupPosition = "first";

    const hasTranslationToggle =
      message.senderType === "customer"
      && shouldOfferMessageTranslation(message.body, conversationLanguage, agentLanguage);

    rows.push({
      kind: "message",
      key: message.id,
      message,
      showMeta,
      groupPosition,
      height: estimateTranscriptRowHeight({
        kind: "message",
        showMeta,
        bodyLength: message.body.length,
        hasTranslationToggle,
        hasLinkPreview: Boolean(firstLinkPreview(message.body)),
      }),
    });
  }

  return rows;
}
