import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Paperclip, Send, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useFloatingAi } from "@/context/floating-ai-context";
import { filterSlashCommands } from "@/lib/floating-ai/slash-commands";
import { FLOATING_AI_CAPABILITIES } from "@/lib/floating-ai/types";

type FloatingAiComposerProps = {
  disabled?: boolean;
  isSending?: boolean;
  onSend: (text: string) => Promise<void>;
  placeholder?: string;
  sendIcon?: LucideIcon;
  hideExtras?: boolean;
};

export function FloatingAiComposer({
  disabled,
  isSending,
  onSend,
  placeholder,
  sendIcon: SendIcon = Send,
  hideExtras = false,
}: FloatingAiComposerProps) {
  const { t } = useTranslation("common");
  const { composerFocusRef, pendingFocusOnOpen, consumePendingFocus } = useFloatingAi();
  const [input, setInput] = useState("");
  const [showSlashHints, setShowSlashHints] = useState(false);
  const localRef = useRef<HTMLTextAreaElement | null>(null);

  const setRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      localRef.current = node;
      composerFocusRef.current = node;
    },
    [composerFocusRef],
  );

  useEffect(() => {
    if (pendingFocusOnOpen) {
      consumePendingFocus();
    }
  }, [pendingFocusOnOpen, consumePendingFocus]);

  const slashMatches = filterSlashCommands(input);

  const submit = async () => {
    const trimmed = input.trim();
    if (!trimmed || disabled || isSending) return;
    setInput("");
    setShowSlashHints(false);
    await onSend(trimmed);
  };

  const applySlashCommand = (command: string) => {
    setInput(`${command} `);
    setShowSlashHints(false);
    localRef.current?.focus();
  };

  return (
    <div className="shrink-0 border-t border-border/60 p-3">
      {showSlashHints && slashMatches.length > 0 && (
        <div
          className="mb-2 overflow-hidden rounded-lg border border-border bg-popover shadow-md"
          role="listbox"
          aria-label={t("floatingAi.slash.hints")}
        >
          {slashMatches.map((cmd) => (
            <button
              key={cmd.command}
              type="button"
              role="option"
              className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-start text-xs hover:bg-accent/50"
              onClick={() => applySlashCommand(cmd.command)}
            >
              <span className="font-mono font-medium text-primary">{cmd.command}</span>
              <span className="text-muted-foreground">{t(cmd.descriptionKey)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex shrink-0 gap-1">
          {!hideExtras && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={!FLOATING_AI_CAPABILITIES.documentUpload}
                aria-label={t("floatingAi.composer.attach")}
                title={FLOATING_AI_CAPABILITIES.documentUpload ? undefined : t("floatingAi.composer.comingSoon")}
              >
                <Paperclip className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={!FLOATING_AI_CAPABILITIES.voice}
                aria-label={t("floatingAi.composer.voice")}
                title={FLOATING_AI_CAPABILITIES.voice ? undefined : t("floatingAi.composer.comingSoon")}
              >
                <Mic className="size-4" />
              </Button>
            </>
          )}
        </div>

        <textarea
          ref={setRef}
          value={input}
          rows={1}
          onChange={(event) => {
            setInput(event.target.value);
            setShowSlashHints(event.target.value.startsWith("/"));
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
            if (event.key === "Escape") {
              setShowSlashHints(false);
            }
          }}
          disabled={disabled || isSending}
          placeholder={placeholder ?? t("floatingAi.composer.placeholder")}
          aria-label={t("floatingAi.composer.inputLabel")}
          className="max-h-24 min-h-[2.5rem] flex-1 resize-none rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/40 disabled:opacity-60"
        />

        <Button
          type="button"
          size="icon"
          className="size-9 shrink-0"
          onClick={() => void submit()}
          disabled={disabled || isSending || !input.trim()}
          aria-label={t("floatingAi.composer.send")}
        >
          <SendIcon className="size-4" />
        </Button>
      </div>
    </div>
  );
}
