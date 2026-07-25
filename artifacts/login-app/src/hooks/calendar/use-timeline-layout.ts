import { useMemo } from "react";
import { TimelineLayoutService } from "@/lib/calendar/services/timeline-layout-service";
import type { CalendarEvent } from "@/lib/calendar/types/calendar-event";
import type { TimelineResourceRef } from "@/lib/calendar/types/timeline-layout";

const timelineLayoutService = new TimelineLayoutService();

export function useTimelineLayout(
  events: CalendarEvent[],
  resources: TimelineResourceRef[],
  anchorDate: string,
) {
  return useMemo(
    () =>
      timelineLayoutService.layoutDay(events, {
        anchorDate,
        resources,
      }),
    [events, resources, anchorDate],
  );
}
