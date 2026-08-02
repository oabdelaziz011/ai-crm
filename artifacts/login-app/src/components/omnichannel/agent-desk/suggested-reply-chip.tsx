import { memo } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { IntelligentSuggestedReply } from "@/lib/omnichannel/types/suggested-reply-types";
import type { SuggestedReplySignal } from "@/lib/omnichannel/types/suggested-reply-types";

export type SuggestedReplyExplainLabels = {
  title: string;
  reason: string;
  signalsUsed: string;
  intent: string;
  mood: string;
  journey: string;
  knowledgeSource: string;
  confidence: string;
  explainSuggestion: string;
  none: string;
  signals: Record<SuggestedReplySignal, string>;
  moodLabels: Record<string, string>;
};

type SuggestedReplyChipProps = {
  reply: IntelligentSuggestedReply;
  labels: SuggestedReplyExplainLabels;
  onSelect: (text: string) => void;
  compact?: boolean;
};

export const SuggestedReplyChip = memo(function SuggestedReplyChip({
  reply,
  labels,
  onSelect,
  compact = false,
}: SuggestedReplyChipProps) {
  const moodLabel = labels.moodLabels[reply.explanation.mood] ?? reply.explanation.mood;

  return (
    <div className="inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--ad-border-subtle)] pe-1 ps-2.5 py-0.5 text-[10px] text-[var(--ad-text-muted)] transition-colors duration-[var(--ad-dur-hover)] hover:border-[var(--ad-accent)] hover:text-[var(--ad-text)]">
      <button
        type="button"
        className="min-w-0 truncate text-start"
        onClick={() => onSelect(reply.text)}
      >
        <span dir="auto">{compact ? reply.text.slice(0, 72) : reply.text}</span>
      </button>
      <span
        className="shrink-0 rounded-full bg-[var(--ad-accent-dim)] px-1.5 py-0.5 text-[9px] font-medium tabular-nums text-[var(--ad-accent)]"
        dir="ltr"
        aria-label={`${labels.confidence}: ${reply.confidence}`}
      >
        {reply.confidence}%
      </span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="rounded-full p-0.5 text-[var(--ad-text-muted)] hover:bg-[var(--ad-accent-dim)] hover:text-[var(--ad-accent)]"
            aria-label={labels.explainSuggestion}
          >
            <Info className="size-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-72 border-[var(--ad-border)] bg-[var(--ad-surface-raised)] p-3 text-xs"
        >
          <p className="mb-2 font-semibold text-[var(--ad-text)]" dir="auto">{labels.title}</p>
          <dl className="space-y-2">
            <ExplainRow label={labels.reason} value={reply.explanation.reason} />
            <ExplainRow
              label={labels.signalsUsed}
              value={reply.explanation.signalsUsed
                .map((signal) => labels.signals[signal] ?? signal)
                .join(" · ")}
            />
            <ExplainRow label={labels.intent} value={reply.explanation.intent} />
            <ExplainRow label={labels.mood} value={moodLabel} />
            <ExplainRow label={labels.journey} value={reply.explanation.journey} />
            <ExplainRow
              label={labels.knowledgeSource}
              value={reply.explanation.knowledgeSource ?? labels.none}
            />
            <ExplainRow label={labels.confidence} value={`${reply.explanation.confidence}%`} dir="ltr" />
          </dl>
        </PopoverContent>
      </Popover>
    </div>
  );
});

function ExplainRow({
  label,
  value,
  dir,
}: {
  label: string;
  value: string;
  dir?: "ltr" | "rtl" | "auto";
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-[var(--ad-text-muted)]" dir="auto">
        {label}
      </dt>
      <dd className="mt-0.5 leading-relaxed text-[var(--ad-text)]" dir={dir ?? "auto"}>
        {value}
      </dd>
    </div>
  );
}
