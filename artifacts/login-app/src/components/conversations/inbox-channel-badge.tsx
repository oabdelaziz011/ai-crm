import { cn } from "@/lib/utils";
import {
  inboxChannelBadgeClass,
  inboxChannelLabel,
} from "@/lib/conversations/conversation-list-display";

type InboxChannelBadgeProps = {
  channelType: string;
  className?: string;
};

export function InboxChannelBadge({ channelType, className }: InboxChannelBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0",
        inboxChannelBadgeClass(channelType),
        className,
      )}
    >
      {inboxChannelLabel(channelType)}
    </span>
  );
}
