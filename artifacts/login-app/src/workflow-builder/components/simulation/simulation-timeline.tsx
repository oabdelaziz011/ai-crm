import { memo } from "react";
import { useTranslation } from "react-i18next";
import { TimelineEventCard } from "@/components/customer-profile/timeline/timeline-event-card";
import { Badge } from "@/components/ui/badge";
import type { SimulationTimelineEntry } from "../../simulation/types/simulation-types";
import { mapSimulationTimelineToViewModels } from "../../simulation/selectors/simulation-timeline-selectors";

type SimulationTimelineProps = {
  entries: SimulationTimelineEntry[];
  companyId: string;
  flowId: string;
  emptyMessage?: string;
};

export const SimulationTimeline = memo(function SimulationTimeline({
  entries,
  companyId,
  flowId,
  emptyMessage,
}: SimulationTimelineProps) {
  const { t } = useTranslation("common");
  const cards = mapSimulationTimelineToViewModels(entries, { companyId, flowId });

  if (cards.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {emptyMessage ?? t("workflowBuilder.simulation.empty")}
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {cards.map((card) => (
        <li key={card.id} className="space-y-1">
          {card.isSimulationPreview ? (
            <Badge variant="outline" className="rounded-full text-[10px] uppercase tracking-wide">
              {t("workflowBuilder.simulation.timeline.previewBadge")}
            </Badge>
          ) : null}
          <TimelineEventCard
            title={card.title}
            description={card.description}
            actor={card.actor}
            icon={card.icon}
            accentClass={card.accentClass}
            occurredAt={card.occurredAt}
            relativeTime={card.relativeTime}
            variant="workspace"
          />
        </li>
      ))}
    </ul>
  );
});
