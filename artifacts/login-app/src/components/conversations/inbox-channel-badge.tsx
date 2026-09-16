import { cn } from "@/lib/utils";
import {
  inboxChannelBadgeClass,
  inboxChannelLabel,
} from "@/lib/conversations/conversation-list-display";
import { ChannelMark } from "@/components/omnichannel/channel-mark";

type InboxChannelBadgeProps = {
  channelType: string;
  className?: string;
  size?: "sm" | "lg";
  showIcon?: boolean;
  /** Icon-only compact mark (list overlays). */
  iconOnly?: boolean;
};

export function InboxChannelBadge({
  channelType,
  className,
  size = "sm",
  showIcon = true,
  iconOnly = false,
}: InboxChannelBadgeProps) {
  const isLarge = size === "lg";
  if (iconOnly) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full border",
          isLarge ? "size-7" : "size-5",
          inboxChannelBadgeClass(channelType),
          className,
        )}
        title={inboxChannelLabel(channelType)}
        aria-label={inboxChannelLabel(channelType)}
      >
        <ChannelMark channel={channelType} className={isLarge ? "size-3.5" : "size-3"} />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-semibold border shrink-0",
        isLarge ? "rounded-lg px-2.5 py-1 text-xs" : "rounded-full px-2 py-0.5 text-[10px]",
        inboxChannelBadgeClass(channelType),
        className,
      )}
    >
      {showIcon ? <ChannelMark channel={channelType} className={isLarge ? "size-3.5" : "size-3"} /> : null}
      {inboxChannelLabel(channelType)}
    </span>
  );
}
