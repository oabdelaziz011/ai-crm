import { memo } from "react";
import { format } from "date-fns";
import { ChannelBadge } from "@/components/omnichannel/channel-badge";
import { cn } from "@/lib/utils";
import type { UnifiedMessage } from "@/lib/omnichannel/types/unified-conversation";

type MessageBubbleProps = {
  message: UnifiedMessage;
};

export const MessageBubble = memo(function MessageBubble({ message }: MessageBubbleProps) {
  const isCustomer = message.senderType === "customer";
  const isSystem = message.senderType === "system" || message.senderType === "automation";
  const isInternalNote = message.isInternalNote;

  return (
    <div
      className={cn(
        "flex w-full",
        isInternalNote ? "justify-center" : isCustomer ? "justify-start" : isSystem ? "justify-center" : "justify-end",
      )}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-2xl border px-3 py-2 transition-colors duration-150",
          isInternalNote && "border-amber-400/25 bg-amber-400/10",
          isCustomer && !isInternalNote && "border-white/10 bg-white/5",
          !isCustomer && !isSystem && !isInternalNote && "border-primary/20 bg-primary/10",
          isSystem && !isInternalNote && "border-white/5 bg-black/20 text-center",
        )}
      >
        <div className="mb-1 flex flex-wrap items-center gap-2">
          {!isInternalNote ? <ChannelBadge channel={message.channel} /> : null}
          <span className="text-[10px] font-medium text-muted-foreground">
            {isInternalNote ? "Internal note" : message.senderLabel}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {format(new Date(message.timestamp), "PPp")}
          </span>
          {!isSystem && !isInternalNote ? (
            <span className="text-[10px] capitalize text-muted-foreground">{message.deliveryStatus}</span>
          ) : null}
        </div>
        <p className="whitespace-pre-wrap text-sm">{message.body}</p>
        {message.attachments.length > 0 ? (
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {message.attachments.map((attachment) => (
              <li key={`${attachment.type}-${attachment.url ?? "none"}`}>
                {attachment.type}: {attachment.url ?? "attachment"}
              </li>
            ))}
          </ul>
        ) : null}
        {message.aiActionLabel ? (
          <p className="mt-2 text-[10px] text-violet-300">AI: {message.aiActionLabel}</p>
        ) : null}
        {message.automationActionLabel ? (
          <p className="mt-1 text-[10px] text-amber-300">Automation: {message.automationActionLabel}</p>
        ) : null}
      </div>
    </div>
  );
});
