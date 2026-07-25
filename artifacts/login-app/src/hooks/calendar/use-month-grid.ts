import { useMemo } from "react";
import type { CalendarEvent, CalendarEventsByDay } from "@/lib/calendar/types/calendar-event";
import {
  buildMonthGrid,
  MONTH_VISIBLE_EVENT_LIMIT,
  type MonthGridCell,
} from "@/lib/calendar/layout/month-agenda-layout";
import type { WeekdayIndex } from "@/lib/scheduling/types";

export type MonthDayEvents = {
  cell: MonthGridCell;
  events: CalendarEvent[];
  visibleEvents: CalendarEvent[];
  overflowCount: number;
};

export function useMonthGrid(
  anchorDate: string,
  weekStartDay: WeekdayIndex,
  eventsByDay: CalendarEventsByDay,
  todayDate: string,
  selectedDate?: string | null,
) {
  return useMemo(() => {
    const cells = buildMonthGrid(anchorDate, weekStartDay);
    const dayEvents: MonthDayEvents[] = cells.map((cell) => {
      const events = eventsByDay.get(cell.date) ?? [];
      const visibleEvents = events.slice(0, MONTH_VISIBLE_EVENT_LIMIT);
      return {
        cell,
        events,
        visibleEvents,
        overflowCount: Math.max(0, events.length - MONTH_VISIBLE_EVENT_LIMIT),
      };
    });

    return {
      cells,
      dayEvents,
      weekCount: Math.ceil(cells.length / 7),
      todayDate,
      selectedDate,
    };
  }, [anchorDate, weekStartDay, eventsByDay, todayDate, selectedDate]);
}
