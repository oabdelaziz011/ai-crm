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
        mode === "human" && "border-sky-500/35 bg-sky-500/10 text-sky-300",
        mode === "ai" && "border-violet-500/35 bg-violet-500/10 text-violet-300",
        mode === "mixed" && "border-amber-500/35 bg-amber-500/10 text-amber-300",
      )}
    >
      {mode === "human" ? humanLabel : mode === "ai" ? aiLabel : "AI + Human"}
    </span>
  );
});
