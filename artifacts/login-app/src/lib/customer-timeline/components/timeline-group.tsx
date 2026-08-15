import type { EnrichedTimelineGroup, TimelineGroup, TimelineRenderContext } from "@/lib/customer-timeline/types";
import { TimelineDateDivider } from "./timeline-date-divider";
import { formatTimelineClock, TimelineCard } from "./timeline-card";

type Props = {
  group: TimelineGroup | EnrichedTimelineGroup;
  renderContext: TimelineRenderContext;
  cardVariant?: "default" | "workspace";
};

export function TimelineGroupSection({ group, renderContext, cardVariant }: Props) {
  return (
    <section className="space-y-2">
      <TimelineDateDivider label={group.label} />
      <ol className="space-y-2">
        {group.activities.map((activity) => (
          <TimelineCard
            key={activity.id}
            activity={activity}
            renderContext={renderContext}
            occurredAtLabel={formatTimelineClock(activity.occurredAt, renderContext.locale)}
            variant={cardVariant}
          />
        ))}
      </ol>
    </section>
  );
}
