import type { TimelineEvent } from "./types.js";

export function timelineEventDedupKey(event: Pick<TimelineEvent, "sourceModule" | "id">): string {
  return `${String(event.sourceModule)}:${String(event.id)}`;
}

export function dedupeTimelineEvents(events: TimelineEvent[]): TimelineEvent[] {
  const deduped = new Map<string, TimelineEvent>();
  for (const event of events) {
    deduped.set(timelineEventDedupKey(event), event);
  }
  return [...deduped.values()];
}
