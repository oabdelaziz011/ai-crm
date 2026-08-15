import { format, formatDistanceToNow } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import { resolveTimelineEventDescriptor } from "@/lib/customer-timeline/event-registry";
import type { EnrichedTimelineActivity, TimelineActivity, TimelineRenderContext } from "@/lib/customer-timeline/types";
import { TimelineEventCard } from "@/components/customer-profile/timeline/timeline-event-card";

type TimelineCardProps = {
  activity: TimelineActivity | EnrichedTimelineActivity;
  renderContext: TimelineRenderContext;
  occurredAtLabel: string;
  variant?: "default" | "workspace";
};

function resolveActorLabel(
  activity: TimelineActivity | EnrichedTimelineActivity,
  translate: TimelineRenderContext["translate"],
): { actor: string; actorLabel: string } {
  const fromActor = activity.actor?.label?.trim() || null;
  const fromMeta =
    (typeof activity.metadata?.actor === "string" && activity.metadata.actor.trim()) || null;
  const name = fromActor || fromMeta;
  if (name) {
    return {
      actor: name,
      actorLabel: translate("dashboard.customerProfile.timeline.byActor", { actor: name }),
    };
  }
  const system = translate("dashboard.customerProfile.timeline.systemActor");
  return {
    actor: system,
    actorLabel: translate("dashboard.customerProfile.timeline.byActor", { actor: system }),
  };
}

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
  const locale = renderContext.locale.startsWith("ar") ? ar : enUS;
  const relativeTime = formatDistanceToNow(new Date(activity.occurredAt), {
    addSuffix: true,
    locale,
  });
  const { actor, actorLabel } = resolveActorLabel(activity, renderContext.translate);

  return (
    <TimelineEventCard
      title={enriched.title}
      description={enriched.description}
      actor={actor}
      actorLabel={actorLabel}
      icon={descriptor.icon}
      accentClass={enriched.accentClass ?? descriptor.accentClass}
      occurredAt={occurredAtLabel}
      relativeTime={relativeTime}
      variant={variant}
      actionLabel={
        variant === "workspace"
          ? renderContext.translate("dashboard.customerWorkspace.timeline.viewDetails")
          : undefined
      }
    />
  );
}

export function formatTimelineClock(iso: string, language: string): string {
  const locale = language.startsWith("ar") ? ar : enUS;
  return format(new Date(iso), language.startsWith("ar") ? "hh:mm a" : "h:mm a", { locale });
}
