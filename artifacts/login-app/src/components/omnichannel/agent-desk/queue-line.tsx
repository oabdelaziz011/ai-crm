import { memo, useEffect, useRef, useState } from "react";
import { format, formatDistanceToNow, isToday } from "date-fns";
import { Bot, Circle, FolderOpen, Pin, Star, User } from "lucide-react";
import {
  getConversationFlags,
  isConversationOpened,
  toggleConversationFlag,
} from "@/lib/omnichannel/presentation/conversation-experience-storage";
import { subscribeDeskIncomingFlash } from "@/lib/omnichannel/presentation/desk-incoming-alerts";
import { resolveConversationAttention } from "@/lib/omnichannel/presentation/inbox-view-state";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { ChannelBadge } from "@/components/omnichannel/channel-badge";
import { buildContactDisplayInput } from "@/lib/omnichannel/presentation/conversation-contact-identity";
import { resolveContactDisplayName } from "@/lib/omnichannel/presentation/contact-display";
import { resolveInboxAssigneeDisplay } from "@/lib/omnichannel/presentation/inbox-assignee-display";
import type { UnifiedConversation } from "@/lib/omnichannel/types/unified-conversation";
import type { OwnershipTier } from "@/lib/omnichannel/presentation/conversation-ownership";
import { omniRenderTrace, OMNI_RENDER_TARGET_ID } from "@/lib/omnichannel/debug/omni-render-audit";
import { traceDomQueueCardMount } from "@/lib/omnichannel/debug/omni-dom-render-audit";

export const AGENT_DESK_QUEUE_ROW_HEIGHT = 76;

type QueueCardProps = {
  conversation: UnifiedConversation;
  active: boolean;
  index: number;
  onSelect: (id: string) => void;
  labels: {
    visitorLabel: string;
    noPreview: string;
    aiEmployee: string;
    unassigned: string;
    open: string;
    newBadge?: string;
    pin?: string;
    star?: string;
    markUnread?: string;
    follow?: string;
  };
  ownerLabel?: string | null;
  ownershipTier?: OwnershipTier;
  unreadOverflowLabel?: string;
};

function AssigneeLine({ tier, label }: { tier: OwnershipTier; label: string }) {
  const Icon =
    tier === "human" ? User : tier === "ai" ? Bot : tier === "queue" ? FolderOpen : Circle;
  const tone =
    tier === "human"
      ? "text-primary"
      : tier === "ai"
        ? "text-[var(--ad-accent)]"
        : tier === "queue"
          ? "text-[var(--ad-warn)]"
          : "text-[var(--ad-text-muted)]";

  return (
    <span className={`inline-flex min-w-0 max-w-[55%] items-center gap-1 truncate ${tone}`}>
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="truncate text-[12px]" dir="auto">
        {label}
      </span>
    </span>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function formatTime(timestamp: string | null): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return isToday(date) ? format(date, "p") : formatDistanceToNow(date, { addSuffix: true });
}

export const QueueCard = memo(function QueueCard({
  conversation,
  active,
  index,
  onSelect,
  labels,
  ownerLabel,
  ownershipTier,
  unreadOverflowLabel = "9+",
}: QueueCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [flags, setFlags] = useState(() => getConversationFlags(conversation.id));
  const name = resolveContactDisplayName(
    buildContactDisplayInput(conversation, conversation.customer, labels.visitorLabel),
  );
  const preview = conversation.lastMessage?.trim() || labels.noPreview;
  const tier = ownershipTier ?? conversation.ownershipTier;
  const assignee = resolveInboxAssigneeDisplay(ownerLabel ?? conversation.ownerLabel, tier, {
    aiEmployee: labels.aiEmployee,
    unassigned: labels.unassigned,
  });

  const showPinned = conversation.isPinned || flags.pinned;
  const showStar = flags.starred;
  const showFollow = flags.following;
  const hasBeenOpened = active || isConversationOpened(conversation.id);
  const attention = resolveConversationAttention({
    unreadCount: conversation.unreadCount,
    hasBeenOpened,
    active,
    markedUnread: flags.markedUnread,
  });
  const showUnreadBadge =
    attention !== "read" && (flags.markedUnread || conversation.unreadCount > 0);
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  useEffect(() => {
    setFlags(getConversationFlags(conversation.id));
  }, [conversation.id]);

  useEffect(() => {
    return subscribeDeskIncomingFlash((conversationId) => {
      if (conversationId !== conversation.id || active) return;
      setFlashing(true);
      window.setTimeout(() => setFlashing(false), 1700);
    });
  }, [conversation.id, active]);

  useEffect(() => {
    if (active) setFlashing(false);
  }, [active]);

  useEffect(() => {
    if (conversation.id !== OMNI_RENDER_TARGET_ID) return;
    window.__OMNI_VIRT_PROOF__ = {
      ...window.__OMNI_VIRT_PROOF__,
      queueCardMounted: true,
    };
    const node = ref.current;
    const style = node ? window.getComputedStyle(node) : null;
    traceDomQueueCardMount({
      conversationId: conversation.id,
      index,
      active,
      node,
    });
    omniRenderTrace("ConversationListItem/QueueCard", [conversation], {
      rendered: true,
      index,
      reactKey: conversation.id,
      active,
      display: style?.display ?? null,
      visibility: style?.visibility ?? null,
      opacity: style?.opacity ?? null,
      pointerEvents: style?.pointerEvents ?? null,
      height: style?.height ?? null,
      overflow: style?.overflow ?? null,
      hidden: node?.hidden ?? false,
      offsetHeight: node?.offsetHeight ?? null,
      offsetTop: node?.offsetTop ?? null,
      filterReason: null,
    });
  }, [conversation, index, active]);

  const toggleFlag = (flag: "pinned" | "starred" | "following" | "markedUnread") => {
    setFlags(toggleConversationFlag(conversation.id, flag));
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={ref}
          role="option"
          aria-selected={active}
          tabIndex={active ? 0 : -1}
          data-index={index}
          onClick={() => onSelect(conversation.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect(conversation.id);
            }
          }}
          className={cn(
            "agent-desk-queue-card ws-inbox-row group relative flex h-[76px] cursor-pointer items-center gap-2.5 border-b border-[var(--ad-border-subtle)]/50 px-3 py-2",
            active && "agent-desk-queue-card--active ws-inbox-row--active",
            !active && attention === "new" && "agent-desk-queue-card--new",
            !active && attention === "unread" && "agent-desk-queue-card--unread",
            !active && flashing && "agent-desk-queue-card--flash",
          )}
          data-attention={attention}
        >
          <div className="relative shrink-0 self-start pt-0.5">
            <div className="flex size-9 items-center justify-center rounded-full bg-[var(--ad-surface-raised)] text-xs font-semibold">
              {initials(name)}
            </div>
            {showUnreadBadge ? (
              <span className="absolute -end-1 -top-1 flex min-w-[1.125rem] items-center justify-center rounded-full bg-[var(--ad-accent)] px-1 text-[14px] font-bold leading-none text-primary-foreground">
                {flags.markedUnread && conversation.unreadCount <= 0
                  ? "•"
                  : conversation.unreadCount > 9
                    ? unreadOverflowLabel
                    : conversation.unreadCount || "•"}
              </span>
            ) : null}
          </div>

          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-1.5">
              {showPinned ? <Pin className="size-3 shrink-0 text-[var(--ad-accent)]" aria-hidden /> : null}
              {showStar ? <Star className="size-3 shrink-0 fill-amber-400 text-amber-400" aria-hidden /> : null}
              {showFollow ? <span className="text-[10px] text-primary" aria-hidden>●</span> : null}
              <p
                className={cn(
                  "agent-desk-queue-card__name truncate text-base leading-tight",
                  attention === "read" ? "font-medium" : "font-bold",
                )}
              >
                {name}
              </p>
              {attention === "new" && labels.newBadge ? (
                <span className="agent-desk-queue-card__new-badge shrink-0">{labels.newBadge}</span>
              ) : null}
              <span className="ms-auto shrink-0 text-[12px] tabular-nums text-[var(--ad-text-muted)]">
                {formatTime(conversation.lastActivityAt)}
              </span>
            </div>

            <p
              className={cn(
                "agent-desk-queue-card__preview truncate text-sm leading-snug",
                attention === "new"
                  ? "font-bold text-[var(--ad-text)]"
                  : "font-normal text-[var(--ad-text-muted)]",
              )}
              dir="auto"
            >
              {preview}
            </p>

            <div className="flex min-w-0 items-center gap-2 text-[12px] text-[var(--ad-text-muted)]">
              <AssigneeLine tier={assignee.tier} label={assignee.display} />
              <span className="text-[var(--ad-border-subtle)]" aria-hidden>
                ·
              </span>
              <ChannelBadge channel={conversation.channel} size="sm" className="!px-1.5 !py-0 !text-[12px]" />
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onSelect(conversation.id)}>{labels.open}</ContextMenuItem>
        <ContextMenuSeparator />
        {labels.pin ? <ContextMenuItem onClick={() => toggleFlag("pinned")}>{labels.pin}</ContextMenuItem> : null}
        {labels.star ? <ContextMenuItem onClick={() => toggleFlag("starred")}>{labels.star}</ContextMenuItem> : null}
        {labels.markUnread ? <ContextMenuItem onClick={() => toggleFlag("markedUnread")}>{labels.markUnread}</ContextMenuItem> : null}
        {labels.follow ? <ContextMenuItem onClick={() => toggleFlag("following")}>{labels.follow}</ContextMenuItem> : null}
      </ContextMenuContent>
    </ContextMenu>
  );
});

export const QueueLine = QueueCard;
