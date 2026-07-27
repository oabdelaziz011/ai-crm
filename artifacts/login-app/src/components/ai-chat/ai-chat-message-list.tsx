import { Sparkles, User } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ChatMessage } from "@/hooks/ai-chat/use-ai-chat-workspace";

type AiChatMessageListProps = {
  messages: ChatMessage[];
  assistantName: string;
  streamingContent?: string;
  isSending?: boolean;
};

function MessageBubble({
  message,
  assistantName,
}: {
  message: ChatMessage;
  assistantName: string;
}) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
          isUser ? "bg-white/10 border border-white/10" : "bg-primary/20 border border-primary/30"
        }`}
      >
        {isUser ? (
          <User className="w-4 h-4 text-muted-foreground" />
        ) : (
          <Sparkles className="w-4 h-4 text-primary" />
        )}
      </div>
      <div className={`max-w-[75%] min-w-0 ${isUser ? "text-end" : ""}`}>
        {!isUser && (
          <p className="text-[11px] text-muted-foreground mb-1 px-1">{assistantName}</p>
        )}
        <div
          className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
            isUser
              ? "bg-primary/20 border border-primary/30 text-primary rounded-tr-sm"
              : "bg-white/5 border border-white/5 text-foreground rounded-tl-sm"
          }`}
        >
          {message.content}
        </div>
      </div>
    </div>
  );
}

export function AiChatMessageList({
  messages,
  assistantName,
  streamingContent,
  isSending,
}: AiChatMessageListProps) {
  const { t } = useTranslation("common");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, isSending]);

  const showStreaming = Boolean(isSending && streamingContent);

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="p-6 space-y-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} assistantName={assistantName} />
        ))}

        {showStreaming && (
          <MessageBubble
            assistantName={assistantName}
            message={{
              id: "streaming",
              role: "assistant",
              content: streamingContent ?? "",
              createdAt: new Date().toISOString(),
              streaming: true,
            }}
          />
        )}

        {isSending && !streamingContent && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-primary animate-pulse" />
            </div>
            <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-white/5 border border-white/5 text-sm text-muted-foreground">
              {t("dashboard.ai.thinking")}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
