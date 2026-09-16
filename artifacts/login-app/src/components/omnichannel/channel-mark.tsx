import { memo } from "react";
import {
  Globe2,
  Instagram,
  Mail,
  MessageCircle,
  MessagesSquare,
  Phone,
  Send,
  Smartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Distinctive channel glyph — brand-colored marks without fake profile photos. */
function WhatsAppMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M12.04 2c-5.46 0-9.91 4.43-9.91 9.9 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21 5.46 0 9.9-4.44 9.9-9.9C21.94 6.43 17.5 2 12.04 2zm5.78 14.05c-.24.68-1.4 1.25-1.93 1.33-.5.08-1.13.11-1.82-.11-.42-.14-.96-.31-1.66-.61-2.92-1.26-4.82-4.2-4.97-4.4-.14-.19-1.2-1.6-1.2-3.05 0-1.45.76-2.16 1.03-2.46.27-.3.59-.37.79-.37h.57c.18 0 .43-.07.67.51.24.6.82 2.07.89 2.22.07.15.12.32.02.52-.1.19-.14.32-.29.49-.14.17-.3.38-.43.51-.14.14-.29.29-.12.57.16.28.73 1.2 1.56 1.95 1.08.96 1.98 1.26 2.26 1.4.28.14.45.12.61-.07.17-.19.7-.81.88-1.09.19-.28.37-.23.63-.14.26.1 1.64.77 1.92.91.28.14.47.21.54.33.07.12.07.68-.17 1.36z" />
    </svg>
  );
}

type ChannelMarkProps = {
  channel: string;
  className?: string;
};

export const ChannelMark = memo(function ChannelMark({ channel, className }: ChannelMarkProps) {
  const props = { className: cn("shrink-0", className), "aria-hidden": true as const };
  switch (channel) {
    case "whatsapp":
      return <WhatsAppMark className={cn("text-emerald-500", className)} />;
    case "facebook":
    case "messenger":
      return <MessageCircle {...props} className={cn("text-blue-500", className)} />;
    case "instagram":
      return <Instagram {...props} className={cn("text-pink-500", className)} />;
    case "email":
      return <Mail {...props} className={cn("text-amber-500", className)} />;
    case "sms":
      return <Smartphone {...props} className={cn("text-violet-500", className)} />;
    case "telegram":
      return <Send {...props} className={cn("text-sky-500", className)} />;
    case "voice":
    case "phone":
      return <Phone {...props} className={cn("text-orange-500", className)} />;
    case "web_chat":
    case "live_chat":
      return <MessagesSquare {...props} className={cn("text-teal-500", className)} />;
    default:
      return <Globe2 {...props} className={cn("text-[var(--ws-muted)]", className)} />;
  }
});
