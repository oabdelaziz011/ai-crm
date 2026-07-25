import { useMemo, useRef } from "react";
import type { CalendarEvent } from "@/lib/calendar/types/calendar-event";
import type { TimelineLayoutResult } from "@/lib/calendar/types/timeline-layout";
import { CalendarResourceColumn } from "@/components/calendar/views/timeline/calendar-resource-column";
import { CalendarNowIndicator } from "@/components/calendar/interaction/calendar-now-indicator";
import type { CalendarGridInteractionProps } from "@/components/calendar/interaction/calendar-interaction-types";
import { useVirtualResourceLanes } from "@/hooks/calendar/use-virtual-resource-lanes";
import { useNowIndicator } from "@/hooks/calendar/use-now-indicator";
import {
  CALENDAR_DAY_END_HOUR,
  CALENDAR_DAY_START_HOUR,
  CALENDAR_TIMELINE_RESOURCE_LABEL_WIDTH_PX,
  getCalendarVisibleHours,
} from "@/lib/calendar/constants/calendar-time-grid-config";

type TimelineGridProps = {
  layout: TimelineLayoutResult;
  events: CalendarEvent[];
  anchorDate: string;
  displayTimezone: string;
  timelineHourWidth: number;
  selectedEventId?: string | null;
  scrollNonce?: number;
  interaction?: CalendarGridInteractionProps;
};

export function TimelineGrid({
  layout,
  events,
  anchorDate,
  displayTimezone,
  timelineHourWidth,
  selectedEventId,
  scrollNonce = 0,
  interaction,
}: TimelineGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventsById = useMemo(
    () => new Map(events.map((event) => [event.id, event])),
    [events],
  );

  const hours = getCalendarVisibleHours(CALENDAR_DAY_START_HOUR, CALENDAR_DAY_END_HOUR);
  const axisWidth = hours.length * timelineHourWidth;

  const { nowPercent } = useNowIndicator(
    displayTimezone,
    anchorDate,
    axisWidth,
    scrollRef,
    CALENDAR_DAY_START_HOUR,
    CALENDAR_DAY_END_HOUR,
    scrollNonce,
    "horizontal",
  );

  const {
    attachScrollRef,
    onScroll,
    visibleLanes,
    paddingTop,
    paddingBottom,
    visibleRange,
  } = useVirtualResourceLanes(layout.lanes);

  const setScrollRef = (node: HTMLDivElement | null) => {
    attachScrollRef(node);
    (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
  };

  return (
    <div
      ref={setScrollRef}
      onScroll={onScroll}
      className="max-h-[640px] overflow-y-auto overflow-x-auto"
      role="grid"
    >
      <div style={{ height: layout.totalHeightPx, position: "relative" }}>
        <div style={{ paddingTop, paddingBottom }}>
          {visibleLanes.map((lane) => (
            <CalendarResourceColumn
              key={lane.resourceId}
              lane={lane}
              eventsById={eventsById}
              timeAxisWidth={axisWidth}
              timelineHourWidth={timelineHourWidth}
              anchorDate={anchorDate}
              selectedEventId={selectedEventId}
              showResourceLabel
              interaction={interaction}
            />
          ))}
        </div>
        <div
          className="pointer-events-none absolute z-20 top-0 bottom-0"
          style={{ left: CALENDAR_TIMELINE_RESOURCE_LABEL_WIDTH_PX, width: axisWidth }}
        >
          <CalendarNowIndicator percent={nowPercent} orientation="horizontal" />
        </div>
        <span className="sr-only">
          Showing resources {visibleRange.startIndex + 1} to {visibleRange.endIndex}
        </span>
      </div>
    </div>
  );
}
