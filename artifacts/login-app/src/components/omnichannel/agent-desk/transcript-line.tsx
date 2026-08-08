import { memo, useEffect, useState } from "react";
import { format } from "date-fns";
import { Bot, Check, CheckCheck, Clock, Loader2, Mic, Sparkles, Star } from "lucide-react";
import type { MessageStatus } from "@workspace/ai-conversation";
import type { OutboundDeliveryPhase } from "@/lib/omnichannel/services/outbound-delivery";
import { BiDirText } from "@/components/omnichannel/presentation/bidir-text";
import { shouldShowDeliveryStatus } from "@/lib/omnichannel/presentation/channel-capabilities";
import { firstLinkPreview } from "@/lib/omnichannel/presentation/link-preview";
import { formatSmartTime, type SmartTimeLabels } from "@/lib/omnichannel/presentation/smart-time";
import type { ResolvedConversationLanguage } from "@/lib/omnichannel/services/conversation-language-detector";
import {
  resolveMessageSourceLanguage,
  shouldOfferMessageTranslation,
} from "@/lib/omnichannel/services/message-translation-display";
import { resolveMessageTranslation } from "@/lib/omnichannel/services/message-translation-cache";
import { MessageAttachmentDisplay } from "@/components/omnichannel/agent-desk/message-attachment-display";
import type { OmnichannelChannelKey, UnifiedMessage } from "@/lib/omnichannel/types/unified-conversation";
import { LinkPreviewCard } from "@/components/omnichannel/agent-desk/link-preview-card";
import {
  MessageReactionsBar,
  ReactionBadge,
} from "@/components/omnichannel/agent-desk/message-reactions-bar";
import { highlightSearchText } from "@/hooks/omnichannel/use-conversation-experience";
import { traceOmniSendEnter, traceOmniSendExit } from "@/lib/omnichannel/debug/omni-send-pipeline-audit";

export type MessageGroupPosition = "single" | "first" | "middle" | "last";

type TranscriptLineProps = {
  message: UnifiedMessage;
  channel: OmnichannelChannelKey;
  showMeta?: boolean;
  groupPosition?: MessageGroupPosition;
  conversationLanguage: ResolvedConversationLanguage;
  agentLanguage: ResolvedConversationLanguage;
  translationLabels: { original: string; translated: string };
  voiceLabel: string;
  aiLabel: string;
  deliveryLabels: Partial<Record<MessageStatus | OutboundDeliveryPhase, string>>;
  smartTimeLabels: SmartTimeLabels;
  searchQuery?: string;
  isSearchActive?: boolean;
  isStarred?: boolean;
  onToggleStar?: () => void;
  reaction?: string | null;
  onReaction?: (emoji: string | null) => void;
  reactionsEnabled?: boolean;
  starLabel?: string;
  attachmentLabels?: {
    download: string;
    openFullscreen: string;
    closeFullscreen: string;
  };
};

function bubbleRadiusClass(isCustomer: boolean, position: MessageGroupPosition): string {
  const base = "rounded-[18px]";
  if (position === "single") return base;
  if (isCustomer) {
    if (position === "first") return `${base} rounded-bl-[6px]`;
    if (position === "middle") return `${base} rounded-tl-[6px] rounded-bl-[6px]`;
    return `${base} rounded-tl-[6px]`;
  }
  if (position === "first") return `${base} rounded-br-[6px]`;
  if (position === "middle") return `${base} rounded-tr-[6px] rounded-br-[6px]`;
  return `${base} rounded-tr-[6px]`;
}

function DeliveryStatus({
  phase,
  labels,
}: {
  phase: OutboundDeliveryPhase;
  labels: Partial<Record<MessageStatus | OutboundDeliveryPhase, string>>;
}) {
  const label = labels[phase] ?? phase;
  if (phase === "read") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[var(--ad-accent)]" title={label}>
        <CheckCheck className="size-3" aria-hidden />
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  if (phase === "delivered") {
    return (
      <span className="inline-flex items-center gap-0.5" title={label}>
        <CheckCheck className="size-3 opacity-70" aria-hidden />
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  if (phase === "sent") {
    return (
      <span className="inline-flex items-center gap-0.5" title={label}>
        <Check className="size-3 opacity-70" aria-hidden />
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  if (phase === "preparing" || phase === "dispatching" || phase === "draft") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-[var(--ad-text-muted)]" title={label}>
        <Loader2 className="size-3 animate-spin" aria-hidden />
        <span dir="auto">{label}</span>
      </span>
    );
  }
  if (phase === "pending_retry") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-[var(--ad-warn)]" title={label}>
        <Clock className="size-3" aria-hidden />
        <span dir="auto">{label}</span>
      </span>
    );
  }
  return <span className="text-[10px] text-[var(--ad-danger)]">{label}</span>;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function MessageBody({ text, searchQuery }: { text: string; searchQuery?: string }) {
  const parts = highlightSearchText(text, searchQuery ?? "");
  return (
    <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed" dir="auto">
      {parts.map((part, index) =>
        part.highlight ? (
          <mark key={index} className="rounded bg-[var(--ad-accent)]/25 px-0.5 text-inherit">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </p>
  );
}

export const TranscriptLine = memo(function TranscriptLine({
  message,
  channel,
  showMeta = true,
  groupPosition = "single",
  conversationLanguage,
  agentLanguage,
  translationLabels,
  voiceLabel,
  aiLabel,
  deliveryLabels,
  smartTimeLabels,
  searchQuery,
  isSearchActive,
  isStarred,
  onToggleStar,
  reaction,
  onReaction,
  reactionsEnabled,
  starLabel = "Star",
  attachmentLabels,
}: TranscriptLineProps) {
  const [showTranslation, setShowTranslation] = useState(false);
  const isCustomer = message.senderType === "customer";
  const isAssistant = message.senderType === "assistant";
  const isSystem = message.senderType === "system" || message.senderType === "automation";
  const isOutgoing = !isCustomer && !isSystem;
  const smartTime = formatSmartTime(message.timestamp, smartTimeLabels);
  const linkPreview = firstLinkPreview(message.body);
  const outboundPhase = message.outboundPhase ?? "preparing";
  const showDelivery = isOutgoing && shouldShowDeliveryStatus(channel, outboundPhase);

  useEffect(() => {
    if (!isOutgoing) return;
    traceOmniSendEnter({
      layer: 12,
      stage: "UI.TranscriptLine.render",
      file: "transcript-line.tsx",
      function: "TranscriptLine",
      line: 168,
      conversationId: message.conversationId,
      messageId: message.id,
      statusBefore: message.deliveryStatus,
      statusAfter: outboundPhase,
      extra: { showDelivery, channel },
    });
    traceOmniSendExit({
      layer: 12,
      stage: "UI.TranscriptLine.render",
      success: true,
      conversationId: message.conversationId,
      messageId: message.id,
      statusBefore: message.deliveryStatus,
      statusAfter: outboundPhase,
    });
  }, [channel, isOutgoing, message.conversationId, message.deliveryStatus, message.id, outboundPhase, showDelivery]);
  const messageSourceLanguage = resolveMessageSourceLanguage(message.body);

  const canTranslate = Boolean(message.body.trim())
    && shouldOfferMessageTranslation(message.body, conversationLanguage, agentLanguage);
  const displayBody = canTranslate && showTranslation && messageSourceLanguage !== "unknown"
    ? resolveMessageTranslation({
        messageId: message.id,
        original: message.body,
        from: messageSourceLanguage,
        to: agentLanguage,
      })
    : message.body;
  const messageAttachments = message.attachments ?? [];

  if (isSystem) {
    return (
      <div className="my-2 flex justify-center py-0.5">
        <span className="rounded-full bg-[var(--ad-surface-2)] px-3 py-1 text-[10px] text-[var(--ad-text-muted)]">
          <BiDirText as="span">{message.body}</BiDirText>
        </span>
      </div>
    );
  }

  const groupSpacing = showMeta ? "mt-[18px]" : "mt-2";
  const alignClass = isCustomer ? "justify-start" : "justify-end";

  const bubbleClass = isCustomer
    ? "bg-[var(--ad-surface-raised)] text-[var(--ad-text)]"
    : isAssistant
      ? "bg-[var(--ad-accent)]/15 text-[var(--ad-text)]"
      : "bg-[var(--ad-accent)]/12 text-[var(--ad-text)]";

  return (
    <div
      className={`group/message flex w-full ${groupSpacing} ${alignClass} ${isSearchActive ? "rounded-md ring-1 ring-[var(--ad-accent)]/40" : ""}`}
      data-message-id={message.id}
    >
      <div className={`flex max-w-[68%] min-w-fit items-end gap-2 ${isOutgoing ? "flex-row-reverse" : "flex-row"}`}>
        {showMeta ? (
          <div
            className={`mb-1 flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
              isCustomer
                ? "bg-[var(--ad-surface-2)] text-[var(--ad-text-muted)]"
                : isAssistant
                  ? "bg-[var(--ad-accent)]/20 text-[var(--ad-accent)]"
                  : "bg-[var(--ad-accent)]/20 text-[var(--ad-accent)]"
            }`}
            aria-hidden
          >
            {isAssistant ? <Bot className="size-3.5" /> : initials(message.senderLabel)}
          </div>
        ) : (
          <div className="size-7 shrink-0" aria-hidden />
        )}

        <div className={`relative min-w-0 px-3.5 py-2 ${bubbleRadiusClass(isCustomer, groupPosition)} ${bubbleClass}`}>
          {onToggleStar ? (
            <button
              type="button"
              className={`absolute ${isOutgoing ? "-left-7" : "-right-7"} top-1 rounded p-0.5 opacity-0 transition-opacity group-hover/message:opacity-100 ${isStarred ? "opacity-100 text-[var(--ad-accent)]" : "text-[var(--ad-text-muted)]"}`}
              onClick={onToggleStar}
              aria-label={starLabel}
              aria-pressed={isStarred}
            >
              <Star className={`size-3.5 ${isStarred ? "fill-current" : ""}`} />
            </button>
          ) : null}

          {showMeta ? (
            <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <BiDirText className="text-[11px] font-semibold leading-none">{message.senderLabel}</BiDirText>
              <time className="text-[10px] tabular-nums text-[var(--ad-text-muted)]" dateTime={message.timestamp} title={smartTime.exact} dir="ltr">
                {smartTime.display}
              </time>
              {isAssistant ? (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-[var(--ad-accent)]">
                  <Sparkles className="size-2.5" /> <span dir="auto">{aiLabel}</span>
                </span>
              ) : null}
            </div>
          ) : null}

          {canTranslate ? (
            <div className="mb-1 flex gap-1">
              <button type="button" className={`rounded px-1.5 py-0.5 text-[9px] ${!showTranslation ? "bg-[var(--ad-accent-dim)] text-[var(--ad-accent)]" : "text-[var(--ad-text-muted)]"}`} onClick={() => setShowTranslation(false)}>
                <span dir="auto">{translationLabels.original}</span>
              </button>
              <button type="button" className={`rounded px-1.5 py-0.5 text-[9px] ${showTranslation ? "bg-[var(--ad-accent-dim)] text-[var(--ad-accent)]" : "text-[var(--ad-text-muted)]"}`} onClick={() => setShowTranslation(true)}>
                <span dir="auto">{translationLabels.translated}</span>
              </button>
            </div>
          ) : null}

          <MessageBody text={displayBody} searchQuery={searchQuery} />
          {attachmentLabels && messageAttachments.length > 0 ? (
            <MessageAttachmentDisplay attachments={messageAttachments} labels={attachmentLabels} />
          ) : null}
          {linkPreview ? <LinkPreviewCard preview={linkPreview} /> : null}
          {reaction ? <ReactionBadge emoji={reaction} /> : null}

          {reactionsEnabled && onReaction ? (
            <MessageReactionsBar
              activeReaction={reaction ?? null}
              onSelect={(emoji) => onReaction(emoji)}
              onClear={() => onReaction(null)}
            />
          ) : null}

          {(message.contentType === "audio" || message.attachments?.some((a) => a.type === "audio")) ? (
            <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-[var(--ad-text-muted)]">
              <Mic className="size-3" /> <span dir="auto">{voiceLabel}</span>
            </span>
          ) : null}

          {isOutgoing && showDelivery ? (
            <div className="mt-1 flex items-center justify-end gap-1.5">
              <DeliveryStatus phase={outboundPhase} labels={deliveryLabels} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
});

export function estimateTranscriptRowHeight(input: {
  kind: "day" | "message";
  showMeta?: boolean;
  bodyLength?: number;
  hasTranslationToggle?: boolean;
  hasLinkPreview?: boolean;
}): number {
  if (input.kind === "day") return 36;
  const lines = Math.max(1, Math.ceil((input.bodyLength ?? 40) / 48));
  const base = input.showMeta ? 76 : 44;
  const toggleExtra = input.hasTranslationToggle ? 24 : 0;
  const linkExtra = input.hasLinkPreview ? 56 : 0;
  return base + toggleExtra + linkExtra + (lines - 1) * 20;
}
