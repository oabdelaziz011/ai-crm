import type { ActivityEvent, ActivityGroup, ActivityPeriod } from "../types/activity-types.js";
import { MOCK_ACTIVITY_EVENTS } from "../mock/mock-activity.js";

const PERIOD_LABELS: Record<ActivityPeriod, string> = {
  today: "activity.periods.today",
  yesterday: "activity.periods.yesterday",
  this_week: "activity.periods.thisWeek",
  older: "activity.periods.older",
};

export class ActivityEngine {
  list(query?: string): ActivityEvent[] {
    const q = query?.trim().toLowerCase();
    let events = [...MOCK_ACTIVITY_EVENTS];
    if (q) {
      events = events.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          e.actor.toLowerCase().includes(q),
      );
    }
    return events.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  }

  groupByPeriod(query?: string): ActivityGroup[] {
    const events = this.list(query);
    const map = new Map<ActivityPeriod, ActivityEvent[]>();
    for (const e of events) {
      const list = map.get(e.period) ?? [];
      list.push(e);
      map.set(e.period, list);
    }
    const order: ActivityPeriod[] = ["today", "yesterday", "this_week", "older"];
    return order
      .filter((p) => map.has(p))
      .map((period) => ({
        period,
        labelKey: PERIOD_LABELS[period],
        events: map.get(period)!,
      }));
  }
}

export const activityEngine = new ActivityEngine();
