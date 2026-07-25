import { useMemo } from "react";
import { CalendarZoomService } from "@/lib/calendar/interaction/calendar-zoom-service";
import type { CalendarZoomLevel } from "@/lib/calendar/interaction/calendar-zoom-service";

const zoomService = new CalendarZoomService();

export function useCalendarZoom(zoomLevel: CalendarZoomLevel) {
  return useMemo(
    () => ({
      zoomLevel,
      hourRowHeight: zoomService.getHourRowHeight(zoomLevel),
      timelineHourWidth: zoomService.getTimelineHourWidth(zoomLevel),
      cycleZoom: () => zoomService.cycleZoom(zoomLevel),
    }),
    [zoomLevel],
  );
}
