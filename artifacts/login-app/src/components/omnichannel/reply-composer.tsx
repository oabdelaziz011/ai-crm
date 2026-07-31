import { memo, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Can } from "@/components/rbac/permission-guard";
import { DashboardCard } from "@/components/dashboard/ui";
import type { OmnichannelAiAssistModel } from "@/lib/omnichannel/types/unified-conversation";

type ReplyComposerProps = {
  disabled?: boolean;
  isSending?: boolean;
  suggestedReplies?: string[];
  placeholder: string;
  internalNoteLabel: string;
  replyLabel: string;
  sendLabel: string;
  templatesLabel: string;
  variablesLabel: string;
  voicePlaceholderLabel: string;
  onSend: (payload: { text: string; mode: "reply" | "internal_note" }) => void;
};

export const ReplyComposer = memo(function ReplyComposer({
  disabled,
  isSending,
  suggestedReplies = [],
  placeholder,
  internalNoteLabel,
  replyLabel,
  sendLabel,
  templatesLabel,
  variablesLabel,
  voicePlaceholderLabel,
  onSend,
}: ReplyComposerProps) {
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<"reply" | "internal_note">("reply");

  const handleSend = () => {
    if (!draft.trim()) return;
    onSend({ text: draft, mode });
    setDraft("");
  };

  return (
    <div className="space-y-3 border-t border-white/5 p-4">
      {suggestedReplies.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {suggestedReplies.map((reply) => (
            <button
              key={reply}
              type="button"
              className="rounded-full border border-white/10 px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setDraft(reply)}
            >
              {reply}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 text-xs">
        <button
          type="button"
          onClick={() => setMode("reply")}
          className={mode === "reply" ? "text-primary" : "text-muted-foreground"}
        >
          {replyLabel}
        </button>
        <button
          type="button"
          onClick={() => setMode("internal_note")}
          className={mode === "internal_note" ? "text-primary" : "text-muted-foreground"}
        >
          {internalNoteLabel}
        </button>
        <span className="text-muted-foreground">· {templatesLabel}</span>
        <span className="text-muted-foreground">· {variablesLabel}</span>
        <span className="text-muted-foreground">· {voicePlaceholderLabel}</span>
      </div>

      <div className="flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={placeholder}
          disabled={disabled || isSending}
          rows={3}
          className="min-h-[72px] flex-1 resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
        />
        <Can permission="ai.conversations.reply">
          <Button disabled={disabled || isSending || !draft.trim()} onClick={handleSend}>
            {isSending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {sendLabel}
          </Button>
        </Can>
      </div>
    </div>
  );
});

type AiAssistPanelProps = {
  model: OmnichannelAiAssistModel;
  title: string;
  summaryLabel: string;
  sentimentLabel: string;
  knowledgeLabel: string;
  escalationLabel: string;
  translationLabel: string;
};

export const AiAssistPanel = memo(function AiAssistPanel({
  model,
  title,
  summaryLabel,
  sentimentLabel,
  knowledgeLabel,
  escalationLabel,
  translationLabel,
}: AiAssistPanelProps) {
  return (
    <DashboardCard className="space-y-3 p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div>
        <p className="text-xs font-medium text-muted-foreground">{summaryLabel}</p>
        <p className="mt-1 text-sm">{model.summary}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground">{sentimentLabel}</p>
        <p className="mt-1 text-sm capitalize">{model.sentiment}</p>
      </div>
      {model.knowledgeSuggestions.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-muted-foreground">{knowledgeLabel}</p>
          <ul className="mt-1 space-y-1 text-sm">
            {model.knowledgeSuggestions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {model.escalationRecommended ? (
        <p className="text-xs text-rose-300">{escalationLabel}</p>
      ) : null}
      <p className="text-xs text-muted-foreground">{translationLabel}: {model.translationPlaceholder}</p>
    </DashboardCard>
  );
});
