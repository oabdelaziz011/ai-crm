import type { CalendarTimelineZoom } from "@/lib/calendar/types/calendar-view-state";
import {
  CALENDAR_HOUR_ROW_HEIGHT_PX,
  CALENDAR_TIMELINE_HOUR_WIDTH_PX,
} from "@/lib/calendar/constants/calendar-time-grid-config";

export type CalendarZoomLevel = CalendarTimelineZoom;

const HOUR_ROW_MULTIPLIERS: Record<CalendarZoomLevel, number> = {
  compact: 0.75,
  comfortable: 1,
  expanded: 1.35,
};

const TIMELINE_WIDTH_MULTIPLIERS: Record<CalendarZoomLevel, number> = {
  compact: 0.8,
  comfortable: 1,
  expanded: 1.25,
};

export class CalendarZoomService {
  getHourRowHeight(level: CalendarZoomLevel = "comfortable"): number {
    return Math.round(CALENDAR_HOUR_ROW_HEIGHT_PX * HOUR_ROW_MULTIPLIERS[level]);
  }

  getTimelineHourWidth(level: CalendarZoomLevel = "comfortable"): number {
    return Math.round(CALENDAR_TIMELINE_HOUR_WIDTH_PX * TIMELINE_WIDTH_MULTIPLIERS[level]);
  }

  cycleZoom(level: CalendarZoomLevel): CalendarZoomLevel {
    if (level === "compact") return "comfortable";
    if (level === "comfortable") return "expanded";
    return "compact";
  }
}
