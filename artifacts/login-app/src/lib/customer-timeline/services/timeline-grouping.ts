import type {
  TimelineActivity,
  TimelineGroup,
  TimelineGroupMode,
  TimelineRenderContext,
} from "@/lib/customer-timeline/types";
import {
  resolveTimelineEventDescriptor,
} from "@/lib/customer-timeline/event-registry";

function startOfWeek(date: Date): string {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = copy.getDate() - day + (day === 0 ? -6 : 1);
  copy.setDate(diff);
  return copy.toISOString().slice(0, 10);
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function groupActivities(
  activities: TimelineActivity[],
  mode: TimelineGroupMode,
  locale: string,
): TimelineGroup[] {
  const buckets = new Map<string, TimelineActivity[]>();

  for (const activity of activities) {
    const date = new Date(activity.occurredAt);
    let key: string;

    switch (mode) {
      case "week":
        key = startOfWeek(date);
        break;
      case "month":
        key = monthKey(date);
        break;
      case "conversation":
        key = String(activity.metadata?.conversationId ?? "general");
        break;
      case "workflow":
        key = String(activity.metadata?.workflowId ?? activity.source);
        break;
      case "booking":
        key = String(activity.metadata?.bookingId ?? "unlinked");
        break;
      case "day":
      default:
        key = activity.occurredAt.slice(0, 10);
        break;
    }

    const bucket = buckets.get(key) ?? [];
    bucket.push(activity);
    buckets.set(key, bucket);
  }

  const dayFormatter = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return [...buckets.entries()].map(([key, bucket]) => ({
    key,
    label: formatGroupLabel(key, mode, locale, dayFormatter),
    mode,
    activities: bucket,
  }));
}

function formatGroupLabel(
  key: string,
  mode: TimelineGroupMode,
  locale: string,
  dayFormatter: Intl.DateTimeFormat,
): string {
  const isAr = locale.toLowerCase().startsWith("ar");
  if (mode === "day") {
    return dayFormatter.format(new Date(`${key}T12:00:00.000Z`));
  }
  if (mode === "week") {
    const day = dayFormatter.format(new Date(`${key}T12:00:00.000Z`));
    return isAr ? `أسبوع ${day}` : `Week of ${day}`;
  }
  if (mode === "month") {
    const [year, month] = key.split("-");
    return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
      new Date(Number(year), Number(month) - 1, 1),
    );
  }
  if (mode === "conversation") {
    if (key === "general") return isAr ? "عام" : "General";
    return isAr ? `محادثة ${key.slice(0, 8)}` : `Conversation ${key.slice(0, 8)}`;
  }
  if (mode === "workflow") {
    return isAr ? `سير عمل ${key.slice(0, 8)}` : `Workflow ${key.slice(0, 8)}`;
  }
  if (mode === "booking") {
    if (key === "unlinked") return isAr ? "أخرى" : "Other";
    return isAr ? `حجز ${key.slice(0, 8)}` : `Booking ${key.slice(0, 8)}`;
  }
  return key;
}

export function enrichActivity(activity: TimelineActivity, ctx: TimelineRenderContext) {
  const descriptor = resolveTimelineEventDescriptor(activity);
  const actorLabel = activity.metadata?.actor ?? activity.actor?.label ?? null;

  return {
    ...activity,
    title: descriptor.resolveTitle(activity, ctx),
    description: descriptor.resolveDescription?.(activity, ctx) ?? activity.metadata?.detail ?? null,
    iconKey: activity.type,
    accentClass: descriptor.accentClass,
    actor: activity.actor ?? {
      id: activity.metadata?.actorId ?? null,
      label: actorLabel,
      type: activity.category === "automation" ? "automation" : actorLabel ? "employee" : "system",
    },
  };
}

export const memoizedGroupCache = new Map<string, TimelineGroup[]>();

export function memoizedGroupActivities(
  activities: TimelineActivity[],
  mode: TimelineGroupMode,
  locale: string,
): TimelineGroup[] {
  const cacheKey = `${mode}:${locale}:${activities.map((a) => a.id).join(",")}`;
  const cached = memoizedGroupCache.get(cacheKey);
  if (cached) return cached;
  const groups = groupActivities(activities, mode, locale);
  memoizedGroupCache.set(cacheKey, groups);
  return groups;
}
