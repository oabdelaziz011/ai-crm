import type { QueryClient } from "@tanstack/react-query";
import type { CalendarFilters, CalendarView } from "@/lib/calendar/types/calendar-view-state";
import { hashCalendarFilters } from "@/lib/calendar/services/calendar-service";

export const CALENDAR_KEY = ["calendar"] as const;
export const CALENDAR_EVENTS_KEY = [...CALENDAR_KEY, "events"] as const;

export function calendarEventsKey(
  companyId: string | null,
  view: CalendarView,
  rangeStart: string,
  rangeEnd: string,
  filters: CalendarFilters,
) {
  return [
    ...CALENDAR_EVENTS_KEY,
    companyId,
    view,
    rangeStart,
    rangeEnd,
    hashCalendarFilters(filters),
  ] as const;
}

export function calendarMetaKey(companyId: string | null) {
  return [...CALENDAR_KEY, "meta", companyId] as const;
}
