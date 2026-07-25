import type { EnrichedTimelineGroup, TimelineGroup } from "@/lib/customer-timeline/types";
import { TimelineDateDivider } from "./timeline-date-divider";
import { TimelineCard } from "./timeline-card";
import type { TimelineRenderContext } from "@/lib/customer-timeline/types";
import { format } from "date-fns";

type Props = {
  group: TimelineGroup | EnrichedTimelineGroup;
  renderContext: TimelineRenderContext;
};

export function TimelineGroupSection({ group, renderContext }: Props) {
  return (
    <section className="space-y-2">
      <TimelineDateDivider label={group.label} />
      <ol className="space-y-2">
        {group.activities.map((activity) => (
          <TimelineCard
            key={activity.id}
            activity={activity}
            renderContext={renderContext}
            occurredAtLabel={format(new Date(activity.occurredAt), "p")}
          />
        ))}
      </ol>
    </section>
  );
}
