import { memo } from "react";
import { format, formatDistanceToNow, isToday } from "date-fns";
import { Bot, Crown, Pin } from "lucide-react";
import { ChannelBadge } from "@/components/omnichannel/channel-badge";
import { cn } from "@/lib/utils";
import type { UnifiedConversation } from "@/lib/omnichannel/types/unified-conversation";

type ConversationItemProps = {
  conversation: UnifiedConversation;
  active: boolean;
  onSelect: (conversationId: string) => void;
  unknownContactLabel: string;
  noPreviewLabel: string;
  aiLabel: string;
  humanLabel: string;
  ownerLabel?: string | null;
  escalated?: boolean;
  escalatedLabel?: string;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function priorityTone(priority: UnifiedConversation["priority"]): string {
  if (priority === "urgent") return "bg-rose-400";
  if (priority === "high") return "bg-amber-400";
  if (priority === "low") return "bg-slate-400";
  return "bg-emerald-400/80";
}

function formatActivity(timestamp: string | null): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return isToday(date) ? format(date, "p") : formatDistanceToNow(date, { addSuffix: true });
}

export const ConversationItem = memo(function ConversationItem({
  conversation,
  active,
  onSelect,
  unknownContactLabel,
  noPreviewLabel,
  aiLabel,
  ownerLabel,
  escalated,
  escalatedLabel,
}: ConversationItemProps) {
  const title = conversation.customer?.name ?? unknownContactLabel;
  const phone = conversation.customer?.phone ?? null;
  const isAi = conversation.lifecycleState === "AI_HANDLING" || conversation.lifecycleState === "NEW";
  const isVip = conversation.priority === "urgent" || conversation.priority === "high";

  return (
    <button
      type="button"
      onClick={() => onSelect(conversation.id)}
      className={cn(
        "group flex h-full w-full gap-3 px-3 py-3 text-start transition-all duration-150",
        "hover:bg-white/[0.04]",
        active && "bg-primary/10 ring-1 ring-inset ring-primary/25",
      )}
    >
      <div className="relative shrink-0">
        <div
          className={cn(
            "flex size-10 items-center justify-center rounded-full text-xs font-semibold",
            active ? "bg-primary/20 text-primary" : "bg-white/[0.06] text-foreground",
          )}
        >
          {initials(title)}
        </div>
        <span
          className={cn("absolute -bottom-0.5 -end-0.5 size-2.5 rounded-full ring-2 ring-background", priorityTone(conversation.priority))}
          aria-hidden
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {conversation.isPinned ? <Pin className="size-3 shrink-0 text-primary" /> : null}
              {isVip ? <Crown className="size-3 shrink-0 text-amber-300" /> : null}
              {escalated ? (
                <span className="shrink-0 rounded bg-rose-400/15 px-1 text-[9px] text-rose-200">{escalatedLabel}</span>
              ) : null}
              <p className="truncate text-sm font-medium">{title}</p>
            </div>
            {phone ? (
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground" dir="ltr">
                {phone}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="text-[10px] text-muted-foreground">{formatActivity(conversation.lastActivityAt)}</span>
            {conversation.unreadCount > 0 ? (
              <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                {conversation.unreadCount > 9 ? "9+" : conversation.unreadCount}
              </span>
            ) : null}
          </div>
        </div>

        <p className="mt-1.5 line-clamp-1 text-xs text-muted-foreground/90">
          {conversation.lastMessage ?? noPreviewLabel}
        </p>

        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <ChannelBadge channel={conversation.channel} />
            {isAi ? (
              <span className="inline-flex items-center gap-0.5 rounded-md bg-violet-400/10 px-1.5 py-0.5 text-[9px] text-violet-200">
                <Bot className="size-2.5" />
                {aiLabel}
              </span>
            ) : null}
            <span className="truncate text-[10px] capitalize text-muted-foreground">
              {conversation.lifecycleState.replace(/_/g, " ").toLowerCase()}
            </span>
          </div>
          {ownerLabel ? (
            <span className="max-w-[96px] truncate rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[9px] text-muted-foreground">
              {ownerLabel}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
});
