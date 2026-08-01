import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { DebuggerTimelineCardViewModel, DebuggerTimelineViewModel } from "../selectors/debugger-ui-selectors";
import { DebuggerVirtualList } from "./debugger-virtual-list";

type DebuggerTimelineProps = {
  timeline: DebuggerTimelineViewModel;
  onSelectTimelineEvent: (eventId: string | null) => void;
};

export const DebuggerTimeline = memo(function DebuggerTimeline({ timeline, onSelectTimelineEvent }: DebuggerTimelineProps) {
  const { t } = useTranslation("common");

  const renderItem = useCallback(
    (card: DebuggerTimelineCardViewModel) => {
      const highlight = card.highlight;
      const Icon = card.icon;

      return (
        <li
          key={card.id}
          className={cn(
            "rounded-xl border transition-colors",
            highlight.isSelected
              ? "border-primary/40 bg-primary/5"
              : highlight.isError
                ? "border-destructive/30 bg-destructive/5"
                : highlight.isWarning
                  ? "border-amber-500/30 bg-amber-500/5"
                  : "border-border/60 bg-card/60",
          )}
        >
          <button
            type="button"
            className="w-full px-4 py-3 text-start"
            aria-current={highlight.isSelected ? "true" : undefined}
            aria-label={t("workflowBuilder.debugger.timeline.selectEvent", { title: card.title })}
            onClick={() => onSelectTimelineEvent(card.id)}
          >
            <div className="mb-2 flex flex-wrap gap-1">
              <Badge variant="outline" className="rounded-full text-[10px] uppercase">
                {t("workflowBuilder.debugger.timeline.debuggerBadge")}
              </Badge>
              {highlight.isReplayPosition ? (
                <Badge variant="secondary" className="rounded-full text-[10px] uppercase">
                  {t("workflowBuilder.debugger.timeline.replayBadge")}
                </Badge>
              ) : null}
            </div>
            <div className="flex gap-3">
              <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg border", card.accentClass)}>
                <Icon className="size-4" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold leading-snug">{card.title}</p>
                  <div className="shrink-0 text-end">
                    <time className="block text-[10px] font-medium text-muted-foreground">{card.occurredAt}</time>
                    <span className="text-[10px] text-muted-foreground/70">{card.relativeTime}</span>
                  </div>
                </div>
                {card.actor ? <p className="mt-0.5 text-[11px] text-muted-foreground">{card.actor}</p> : null}
                {card.description ? (
                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{card.description}</p>
                ) : null}
              </div>
            </div>
          </button>
        </li>
      );
    },
    [onSelectTimelineEvent, t],
  );

  if (timeline.cards.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("workflowBuilder.debugger.empty")}</p>;
  }

  return (
    <DebuggerVirtualList
      items={timeline.cards}
      listWindow={timeline.listWindow}
      rowHeight={timeline.rowHeight}
      renderItem={renderItem}
    />
  );
});
