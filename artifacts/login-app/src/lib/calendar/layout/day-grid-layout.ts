import type { CSSProperties } from "react";
import type { CalendarEvent } from "@/lib/calendar/types/calendar-event";
import {
  CALENDAR_DAY_END_HOUR,
  CALENDAR_DAY_START_HOUR,
  CALENDAR_HOUR_ROW_HEIGHT_PX,
  displayTimeToMinutes,
} from "@/lib/calendar/constants/calendar-time-grid-config";

const MIN_EVENT_HEIGHT_PX = 28;

/**
 * Position an event on a vertical day/week grid using pixel geometry.
 * Percentage heights break when the column has no definite CSS height —
 * pixels stay correct as long as hourRowHeight matches the painted rows.
 */
export function layoutEventInDayGrid(
  event: CalendarEvent,
  dayStartHour = CALENDAR_DAY_START_HOUR,
  _dayEndHour = CALENDAR_DAY_END_HOUR,
  hourRowHeightPx = CALENDAR_HOUR_ROW_HEIGHT_PX,
): CSSProperties {
  const dayStartMinutes = dayStartHour * 60;
  const startMinutes = displayTimeToMinutes(event.displayStart);
  const topPx = ((startMinutes - dayStartMinutes) / 60) * hourRowHeightPx;
  const heightPx = Math.max(
    (Math.max(event.durationMinutes, 15) / 60) * hourRowHeightPx,
    MIN_EVENT_HEIGHT_PX,
  );

  return {
    top: `${Math.max(0, topPx)}px`,
    height: `${heightPx}px`,
    left: "6px",
    right: "6px",
  };
}
