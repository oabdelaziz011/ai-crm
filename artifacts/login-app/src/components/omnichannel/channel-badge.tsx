import { memo } from "react";
import { InboxChannelBadge } from "@/components/conversations/inbox-channel-badge";
import { cn } from "@/lib/utils";
import type { UnifiedConversation } from "@/lib/omnichannel/types/unified-conversation";

type ChannelBadgeProps = {
  channel: string;
  className?: string;
  size?: "sm" | "lg";
};

export const ChannelBadge = memo(function ChannelBadge({ channel, className, size = "lg" }: ChannelBadgeProps) {
  return <InboxChannelBadge channelType={channel} className={className} size={size} showIcon />;
});

type HandlerModeBadgeProps = {
  mode: UnifiedConversation["handlerMode"];
  aiLabel: string;
  humanLabel: string;
};

export const HandlerModeBadge = memo(function HandlerModeBadge({
  mode,
  aiLabel,
  humanLabel,
}: HandlerModeBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold",
        mode === "human" && "border-primary/35 bg-primary/10 text-primary",
        mode === "ai" && "border-accent-foreground/35 bg-accent text-accent-foreground",
        mode === "mixed" && "border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.1)] text-[hsl(var(--warning))]",
      )}
    >
      {mode === "human" ? humanLabel : mode === "ai" ? aiLabel : "AI + Human"}
    </span>
  );
});
