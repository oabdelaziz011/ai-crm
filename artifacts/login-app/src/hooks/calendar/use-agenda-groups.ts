import { useMemo } from "react";
import type { CalendarEvent, CalendarEventsByDay } from "@/lib/calendar/types/calendar-event";
import { buildAgendaDayKeys } from "@/lib/calendar/layout/month-agenda-layout";

export type AgendaDayGroup = {
  date: string;
  events: CalendarEvent[];
  isEmpty: boolean;
};

export function useAgendaGroups(
  startDate: string,
  endDate: string,
  eventsByDay: CalendarEventsByDay,
) {
  return useMemo(() => {
    const dayKeys = buildAgendaDayKeys(startDate, dayKeysBetween(startDate, endDate));
    const groups: AgendaDayGroup[] = dayKeys.map((date) => {
      const events = eventsByDay.get(date) ?? [];
      return {
        date,
        events,
        isEmpty: events.length === 0,
      };
    });
    return groups;
  }, [startDate, endDate, eventsByDay]);
}

function dayKeysBetween(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return Math.max(1, Math.floor((end - start) / 86_400_000) + 1);
}
