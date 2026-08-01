import { forwardRef, memo, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import {
  Languages,
  Loader2,
  Mic,
  Paperclip,
  Send,
  Smile,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Can } from "@/components/rbac/permission-guard";

type ReplyComposerProps = {
  disabled?: boolean;
  isSending?: boolean;
  suggestedReplies?: string[];
  detectedLanguage?: string;
  placeholder: string;
  internalNoteLabel: string;
  replyLabel: string;
  sendLabel: string;
  templatesLabel: string;
  variablesLabel: string;
  voicePlaceholderLabel: string;
  emojiLabel: string;
  attachmentsLabel: string;
  aiRewriteLabel: string;
  translateLabel: string;
  languageLabel: string;
  onSend: (payload: { text: string; mode: "reply" | "internal_note" }) => void;
};

export const ReplyComposer = memo(
  forwardRef<HTMLTextAreaElement, ReplyComposerProps>(function ReplyComposer(
    {
      disabled,
      isSending,
      suggestedReplies = [],
      detectedLanguage,
      placeholder,
      internalNoteLabel,
      replyLabel,
      sendLabel,
      templatesLabel,
      variablesLabel,
      voicePlaceholderLabel,
      emojiLabel,
      attachmentsLabel,
      aiRewriteLabel,
      translateLabel,
      languageLabel,
      onSend,
    },
    ref,
  ) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => textareaRef.current as HTMLTextAreaElement);

    const [draft, setDraft] = useState("");
    const [mode, setMode] = useState<"reply" | "internal_note">("reply");

    const handleSend = () => {
      if (!draft.trim()) return;
      onSend({ text: draft, mode });
      setDraft("");
    };

    const appendEmoji = () => {
      setDraft((current) => `${current} 🙂`);
      textareaRef.current?.focus();
    };

    const applySuggested = (reply: string) => {
      setDraft(reply);
      textareaRef.current?.focus();
    };

    return (
      <div className="space-y-2 border-t border-white/5 p-3">
        {suggestedReplies.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {suggestedReplies.slice(0, 3).map((reply) => (
              <button
                key={reply}
                type="button"
                className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
                onClick={() => applySuggested(reply)}
              >
                {reply.slice(0, 64)}
                {reply.length > 64 ? "…" : ""}
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMode("reply")}
              className={mode === "reply" ? "text-primary" : undefined}
            >
              {replyLabel}
            </button>
            <button
              type="button"
              onClick={() => setMode("internal_note")}
              className={mode === "internal_note" ? "text-primary" : undefined}
            >
              {internalNoteLabel}
            </button>
            {detectedLanguage ? (
              <span>
                {languageLabel}: {detectedLanguage}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            <ToolbarIcon label={emojiLabel} onClick={appendEmoji}>
              <Smile className="size-3.5" />
            </ToolbarIcon>
            <ToolbarIcon label={attachmentsLabel}>
              <Paperclip className="size-3.5" />
            </ToolbarIcon>
            <ToolbarIcon label={voicePlaceholderLabel}>
              <Mic className="size-3.5" />
            </ToolbarIcon>
            <ToolbarIcon label={templatesLabel} />
            <ToolbarIcon label={variablesLabel} />
            <ToolbarIcon label={aiRewriteLabel}>
              <Sparkles className="size-3.5" />
            </ToolbarIcon>
            <ToolbarIcon label={translateLabel}>
              <Languages className="size-3.5" />
            </ToolbarIcon>
          </div>
        </div>

        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={mode === "internal_note" ? internalNoteLabel : placeholder}
            disabled={disabled || isSending}
            rows={2}
            aria-label={mode === "internal_note" ? internalNoteLabel : replyLabel}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
            className="min-h-[56px] flex-1 resize-none rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-primary/40"
          />
          <Can permission="ai.conversations.reply">
            <Button
              size="sm"
              disabled={disabled || isSending || !draft.trim()}
              onClick={handleSend}
              aria-label={sendLabel}
            >
              {isSending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {sendLabel}
            </Button>
          </Can>
        </div>
      </div>
    );
  }),
);

function ToolbarIcon({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="rounded p-1 transition-colors duration-150 hover:bg-white/5 hover:text-foreground"
    >
      {children ?? <span>{label.slice(0, 1)}</span>}
    </button>
  );
}
