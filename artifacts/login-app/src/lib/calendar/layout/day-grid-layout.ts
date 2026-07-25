import type { CSSProperties } from "react";
import type { CalendarEvent } from "@/lib/calendar/types/calendar-event";
import {
  CALENDAR_DAY_END_HOUR,
  CALENDAR_DAY_START_HOUR,
  getCalendarDayTotalMinutes,
  displayTimeToMinutes,
} from "@/lib/calendar/constants/calendar-time-grid-config";

export function layoutEventInDayGrid(
  event: CalendarEvent,
  dayStartHour = CALENDAR_DAY_START_HOUR,
  dayEndHour = CALENDAR_DAY_END_HOUR,
): CSSProperties {
  const dayStartMinutes = dayStartHour * 60;
  const totalMinutes = getCalendarDayTotalMinutes(dayStartHour, dayEndHour);
  const startMinutes = displayTimeToMinutes(event.displayStart);
  const top = ((startMinutes - dayStartMinutes) / totalMinutes) * 100;
  const height = Math.max((event.durationMinutes / totalMinutes) * 100, 2.5);

  return {
    top: `${Math.max(0, top)}%`,
    height: `${Math.min(height, 100 - Math.max(0, top))}%`,
  };
}
