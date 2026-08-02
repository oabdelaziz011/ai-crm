import {
  Instagram,
  Mail,
  MessageCircle,
  MessagesSquare,
  Phone,
  Send,
  Smartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  inboxChannelBadgeClass,
  inboxChannelLabel,
} from "@/lib/conversations/conversation-list-display";

type InboxChannelBadgeProps = {
  channelType: string;
  className?: string;
  size?: "sm" | "lg";
  showIcon?: boolean;
};

function ChannelIcon({ channelType, className }: { channelType: string; className?: string }) {
  const props = { className: cn("shrink-0", className), "aria-hidden": true as const };
  switch (channelType) {
    case "whatsapp":
      return <MessageCircle {...props} />;
    case "facebook":
    case "messenger":
      return <MessageCircle {...props} />;
    case "instagram":
      return <Instagram {...props} />;
    case "email":
      return <Mail {...props} />;
    case "sms":
      return <Smartphone {...props} />;
    case "telegram":
      return <Send {...props} />;
    case "voice":
    case "phone":
      return <Phone {...props} />;
    case "web_chat":
    case "live_chat":
      return <MessagesSquare {...props} />;
    default:
      return <MessageCircle {...props} />;
  }
}

export function InboxChannelBadge({
  channelType,
  className,
  size = "sm",
  showIcon = true,
}: InboxChannelBadgeProps) {
  const isLarge = size === "lg";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-semibold border shrink-0",
        isLarge ? "rounded-lg px-2.5 py-1 text-xs" : "rounded-full px-2 py-0.5 text-[10px]",
        inboxChannelBadgeClass(channelType),
        className,
      )}
    >
      {showIcon ? <ChannelIcon channelType={channelType} className={isLarge ? "size-3.5" : "size-3"} /> : null}
      {inboxChannelLabel(channelType)}
    </span>
  );
}
