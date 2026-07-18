import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

type AiChatComposerProps = {
  disabled?: boolean;
  isSending?: boolean;
  onSend: (text: string) => Promise<void>;
};

export function AiChatComposer({ disabled, isSending, onSend }: AiChatComposerProps) {
  const { t } = useTranslation("common");
  const [input, setInput] = useState("");

  const submit = async () => {
    const trimmed = input.trim();
    if (!trimmed || disabled || isSending) return;
    setInput("");
    await onSend(trimmed);
  };

  return (
    <div className="p-4 border-t border-white/5 flex gap-3">
      <input
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void submit();
          }
        }}
        disabled={disabled || isSending}
        placeholder={t("dashboard.ai.placeholder")}
        className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/40 transition-colors disabled:opacity-60"
      />
      <Button
        type="button"
        onClick={() => void submit()}
        disabled={disabled || isSending || !input.trim()}
        className="bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary px-4"
      >
        <Send className="w-4 h-4" />
      </Button>
    </div>
  );
}
