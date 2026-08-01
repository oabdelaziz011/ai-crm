import { memo, useMemo } from "react";
import { format, isSameDay } from "date-fns";
import { CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UnifiedMessage } from "@/lib/omnichannel/types/unified-conversation";

type MessageBubbleProps = {
  message: UnifiedMessage;
  showMeta?: boolean;
};

export const MessageBubble = memo(function MessageBubble({ message, showMeta = true }: MessageBubbleProps) {
  const isCustomer = message.senderType === "customer";
  const isSystem = message.senderType === "system" || message.senderType === "automation";
  const isInternalNote = message.isInternalNote;

  if (isInternalNote) {
    return (
      <div className="flex justify-center py-1">
        <div className="max-w-[90%] rounded-lg border border-amber-400/20 bg-amber-400/8 px-3 py-2 text-center">
          <p className="text-[10px] font-medium uppercase tracking-wide text-amber-200/80">Internal note</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-amber-50/90">{message.body}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {message.senderLabel} · {format(new Date(message.timestamp), "p")}
          </p>
        </div>
      </div>
    );
  }

  if (isSystem) {
    return (
      <div className="flex justify-center py-1">
        <p className="rounded-full bg-white/[0.04] px-3 py-1 text-[11px] text-muted-foreground">
          {message.body}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex w-full py-0.5", isCustomer ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[min(78%,520px)] rounded-2xl px-3.5 py-2.5 shadow-sm transition-colors duration-150",
          isCustomer
            ? "rounded-es-md bg-white/[0.07] ring-1 ring-white/[0.06]"
            : "rounded-ee-md bg-primary/15 ring-1 ring-primary/20",
        )}
      >
        {showMeta ? (
          <p className="mb-1 text-[10px] font-medium text-muted-foreground">{message.senderLabel}</p>
        ) : null}
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
        <div className="mt-1.5 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
          <span>{format(new Date(message.timestamp), "p")}</span>
          {!isCustomer ? (
            <CheckCheck className="size-3 opacity-70" aria-label={message.deliveryStatus} />
          ) : null}
        </div>
      </div>
    </div>
  );
});

type MessageThreadProps = {
  messages: UnifiedMessage[];
  showInternalNotes?: boolean;
};

export const MessageThread = memo(function MessageThread({
  messages,
  showInternalNotes = false,
}: MessageThreadProps) {
  const groups = useMemo(
    () => groupMessages(messages, showInternalNotes),
    [messages, showInternalNotes],
  );

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.key}>
          <div className="sticky top-0 z-10 mb-2 flex justify-center">
            <span className="rounded-full bg-white/[0.05] px-2.5 py-0.5 text-[10px] text-muted-foreground backdrop-blur-sm">
              {group.dayLabel}
            </span>
          </div>
          <div className="space-y-1">
            {group.messages.map((message, index) => {
              const previous = group.messages[index - 1];
              const sameSender = previous?.senderType === message.senderType && !message.isInternalNote;
              return (
                <MessageBubble key={message.id} message={message} showMeta={!sameSender} />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
});

function groupMessages(messages: UnifiedMessage[], showInternalNotes: boolean) {
  const groups: Array<{ key: string; dayLabel: string; messages: UnifiedMessage[] }> = [];
  for (const message of messages.filter((entry) => showInternalNotes || !entry.isInternalNote)) {
    const day = new Date(message.timestamp);
    const key = format(day, "yyyy-MM-dd");
    const dayLabel = isSameDay(day, new Date()) ? "Today" : format(day, "MMM d, yyyy");
    const existing = groups.find((group) => group.key === key);
    if (existing) {
      existing.messages.push(message);
    } else {
      groups.push({ key, dayLabel, messages: [message] });
    }
  }
  return groups;
}
