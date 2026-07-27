import { formatDistanceToNow } from "date-fns";
import { resolveTimelineEventDescriptor } from "@/lib/customer-timeline/event-registry";
import type { EnrichedTimelineActivity, TimelineActivity, TimelineRenderContext } from "@/lib/customer-timeline/types";
import { TimelineEventCard } from "@/components/customer-profile/timeline/timeline-event-card";

type TimelineCardProps = {
  activity: TimelineActivity | EnrichedTimelineActivity;
  renderContext: TimelineRenderContext;
  occurredAtLabel: string;
  variant?: "default" | "workspace";
};

export function TimelineCard({ activity, renderContext, occurredAtLabel, variant = "default" }: TimelineCardProps) {
  const enriched =
    "title" in activity && typeof activity.title === "string"
      ? activity
      : (() => {
          const descriptor = resolveTimelineEventDescriptor(activity);
          return {
            ...activity,
            title: descriptor.resolveTitle(activity, renderContext),
            description: descriptor.resolveDescription?.(activity, renderContext) ?? activity.metadata?.detail ?? null,
            accentClass: descriptor.accentClass,
          };
        })();

  const descriptor = resolveTimelineEventDescriptor(activity);
  const relativeTime = formatDistanceToNow(new Date(activity.occurredAt), { addSuffix: true });

  return (
    <TimelineEventCard
      title={enriched.title}
      description={enriched.description}
      actor={activity.metadata?.actor ?? null}
      actorLabel={renderContext.translate("dashboard.customerProfile.timeline.byActor", {
        actor: activity.metadata?.actor ?? "",
      })}
      icon={descriptor.icon}
      accentClass={enriched.accentClass ?? descriptor.accentClass}
      occurredAt={occurredAtLabel}
      relativeTime={relativeTime}
      variant={variant}
      actionLabel={variant === "workspace" ? renderContext.translate("dashboard.customerWorkspace.timeline.viewDetails") : undefined}
    />
  );
}
