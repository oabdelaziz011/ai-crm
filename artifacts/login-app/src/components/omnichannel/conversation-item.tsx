import { memo } from "react";
import { formatDistanceToNow } from "date-fns";
import { Pin } from "lucide-react";
import { ChannelBadge, HandlerModeBadge } from "@/components/omnichannel/channel-badge";
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
};

export const ConversationItem = memo(function ConversationItem({
  conversation,
  active,
  onSelect,
  unknownContactLabel,
  noPreviewLabel,
  aiLabel,
  humanLabel,
}: ConversationItemProps) {
  const title = conversation.customer?.name ?? unknownContactLabel;
  const subtitle = conversation.customer?.phone ?? conversation.customer?.email ?? "";

  return (
    <button
      type="button"
      onClick={() => onSelect(conversation.id)}
      className={cn(
        "w-full border-b border-white/5 px-4 py-3 text-start transition-colors hover:bg-white/[0.03]",
        active && "border-s-2 border-s-primary bg-primary/10",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {conversation.isPinned ? <Pin className="size-3 text-primary" /> : null}
            <p className="truncate text-sm font-semibold">{title}</p>
          </div>
          {subtitle ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p> : null}
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/90">
            {conversation.lastMessage ?? noPreviewLabel}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <ChannelBadge channel={conversation.channel} />
          {conversation.lastActivityAt ? (
            <span className="text-[10px] text-muted-foreground">
              {formatDistanceToNow(new Date(conversation.lastActivityAt), { addSuffix: true })}
            </span>
          ) : null}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <HandlerModeBadge mode={conversation.handlerMode} aiLabel={aiLabel} humanLabel={humanLabel} />
        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] capitalize text-muted-foreground">
          {conversation.status.replace(/_/g, " ")}
        </span>
        {conversation.unreadCount > 0 ? (
          <span className="rounded-full border border-primary/20 bg-primary/15 px-2 py-0.5 text-[10px] text-primary">
            {conversation.unreadCount}
          </span>
        ) : null}
      </div>
    </button>
  );
});
