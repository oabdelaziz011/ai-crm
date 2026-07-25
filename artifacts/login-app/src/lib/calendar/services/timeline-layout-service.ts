import type { CalendarEvent } from "@/lib/calendar/types/calendar-event";
import type {
  TimelineEventLayout,
  TimelineLayoutResult,
  TimelineResourceLaneLayout,
  TimelineResourceRef,
} from "@/lib/calendar/types/timeline-layout";
import {
  CALENDAR_DAY_END_HOUR,
  CALENDAR_DAY_START_HOUR,
  CALENDAR_TIMELINE_BASE_LANE_HEIGHT_PX,
  CALENDAR_TIMELINE_HOUR_WIDTH_PX,
  CALENDAR_TIMELINE_STACK_LANE_HEIGHT_PX,
  displayTimeToMinutes,
  getCalendarDayTotalMinutes,
  getCalendarVisibleHours,
} from "@/lib/calendar/constants/calendar-time-grid-config";

export type TimelineLayoutOptions = {
  anchorDate: string;
  resources: TimelineResourceRef[];
  startHour?: number;
  endHour?: number;
  baseLaneHeightPx?: number;
  stackLaneHeightPx?: number;
};

function eventsOverlap(a: CalendarEvent, b: CalendarEvent): boolean {
  const aStart = displayTimeToMinutes(a.displayStart);
  const aEnd = displayTimeToMinutes(a.displayEnd);
  const bStart = displayTimeToMinutes(b.displayStart);
  const bEnd = displayTimeToMinutes(b.displayEnd);
  return aStart < bEnd && aEnd > bStart;
}

function assignEventStacks(events: CalendarEvent[]): Map<string, { stackIndex: number; stackCount: number }> {
  const sorted = [...events].sort(
    (a, b) => displayTimeToMinutes(a.displayStart) - displayTimeToMinutes(b.displayStart),
  );
  const columns: CalendarEvent[][] = [];

  for (const event of sorted) {
    let placed = false;
    for (let index = 0; index < columns.length; index += 1) {
      const column = columns[index];
      const last = column[column.length - 1];
      if (!eventsOverlap(last, event)) {
        column.push(event);
        placed = true;
        break;
      }
    }
    if (!placed) {
      columns.push([event]);
    }
  }

  const stackCount = Math.max(columns.length, 1);
  const result = new Map<string, { stackIndex: number; stackCount: number }>();
  columns.forEach((column, stackIndex) => {
    column.forEach((event) => {
      result.set(event.id, { stackIndex, stackCount });
    });
  });
  return result;
}

function layoutEventHorizontal(
  event: CalendarEvent,
  stackIndex: number,
  stackCount: number,
  startHour: number,
  endHour: number,
  baseLaneHeightPx: number,
  stackLaneHeightPx: number,
): TimelineEventLayout {
  const dayStartMinutes = startHour * 60;
  const totalMinutes = getCalendarDayTotalMinutes(startHour, endHour);
  const startMinutes = displayTimeToMinutes(event.displayStart);
  const endMinutes = displayTimeToMinutes(event.displayEnd);
  const durationMinutes = Math.max(endMinutes - startMinutes, 1);

  const leftPercent = ((startMinutes - dayStartMinutes) / totalMinutes) * 100;
  const widthPercent = (durationMinutes / totalMinutes) * 100;
  const laneHeightPx =
    stackCount <= 1
      ? baseLaneHeightPx
      : baseLaneHeightPx + (stackCount - 1) * stackLaneHeightPx;
  const stackHeightPx = laneHeightPx / stackCount;

  return {
    eventId: event.id,
    resourceId: event.resource?.id ?? "unassigned",
    stackIndex,
    stackCount,
    leftPercent,
    widthPercent,
    style: {
      left: `${Math.max(0, leftPercent)}%`,
      width: `${Math.min(widthPercent, 100 - Math.max(0, leftPercent))}%`,
      top: stackIndex * stackHeightPx + 4,
      height: Math.max(stackHeightPx - 8, 24),
    },
  };
}

export class TimelineLayoutService {
  layoutDay(
    events: CalendarEvent[],
    options: TimelineLayoutOptions,
  ): TimelineLayoutResult {
    const startHour = options.startHour ?? CALENDAR_DAY_START_HOUR;
    const endHour = options.endHour ?? CALENDAR_DAY_END_HOUR;
    const baseLaneHeightPx = options.baseLaneHeightPx ?? CALENDAR_TIMELINE_BASE_LANE_HEIGHT_PX;
    const stackLaneHeightPx = options.stackLaneHeightPx ?? CALENDAR_TIMELINE_STACK_LANE_HEIGHT_PX;

    const dayEvents = events.filter((event) => event.displayDate === options.anchorDate);
    const resourceIds = new Set(options.resources.map((resource) => resource.id));

    const eventsByResource = new Map<string, CalendarEvent[]>();
    for (const resource of options.resources) {
      eventsByResource.set(resource.id, []);
    }

    for (const event of dayEvents) {
      const resourceId = event.resource?.id;
      if (!resourceId || !resourceIds.has(resourceId)) {
        continue;
      }
      eventsByResource.get(resourceId)?.push(event);
    }

    const lanes: TimelineResourceLaneLayout[] = options.resources.map((resource) => {
      const resourceEvents = eventsByResource.get(resource.id) ?? [];
      const stacks = assignEventStacks(resourceEvents);
      const stackCount = resourceEvents.length
        ? Math.max(...[...stacks.values()].map((item) => item.stackCount), 1)
        : 1;
      const laneHeightPx =
        stackCount <= 1
          ? baseLaneHeightPx
          : baseLaneHeightPx + (stackCount - 1) * stackLaneHeightPx;

      const eventLayouts = resourceEvents.map((event) => {
        const stack = stacks.get(event.id) ?? { stackIndex: 0, stackCount: 1 };
        return layoutEventHorizontal(
          event,
          stack.stackIndex,
          stackCount,
          startHour,
          endHour,
          baseLaneHeightPx,
          stackLaneHeightPx,
        );
      });

      return {
        resourceId: resource.id,
        resourceName: resource.name,
        stackCount,
        laneHeightPx,
        events: eventLayouts,
      };
    });

    const totalHeightPx = lanes.reduce((sum, lane) => sum + lane.laneHeightPx, 0);
    const hourCount = getCalendarVisibleHours(startHour, endHour).length;

    return {
      lanes,
      totalHeightPx,
      timeAxisWidthPx: hourCount * CALENDAR_TIMELINE_HOUR_WIDTH_PX,
    };
  }
}
