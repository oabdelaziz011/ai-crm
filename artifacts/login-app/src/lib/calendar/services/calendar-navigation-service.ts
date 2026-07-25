import {
  addDays,
  addMonths,
  addWeeks,
  endOfWeek,
  format,
  parseISO,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";
import type { CalendarView } from "@/lib/calendar/types/calendar-view-state";
import type {
  CalendarFetchRange,
  CalendarNavigationDirection,
  CalendarVisibleRange,
} from "@/lib/calendar/types/calendar-range";
import {
  AGENDA_VISIBLE_DAYS,
  getAgendaVisibleEndDate,
  getMonthGridRange,
} from "@/lib/calendar/layout/month-agenda-layout";
import { localDateTimeToInstantIso } from "@/lib/scheduling/booking-domain/booking-time-utils";
import { TimezoneResolver } from "@/lib/scheduling/availability-engine/timezone-resolver";

export class CalendarNavigationService {
  goToToday(now: Date, timezone: string): string {
    return TimezoneResolver.localDateForInstant(now, timezone);
  }

  jumpToDate(date: string): string {
    return date;
  }

  shiftAnchor(
    view: CalendarView,
    anchorDate: string,
    direction: CalendarNavigationDirection,
  ): string {
    const anchor = parseISO(`${anchorDate}T12:00:00`);
    if (view === "day" || view === "timeline") {
      return format(direction === "next" ? addDays(anchor, 1) : subDays(anchor, 1), "yyyy-MM-dd");
    }
    if (view === "agenda") {
      return format(
        direction === "next"
          ? addDays(anchor, AGENDA_VISIBLE_DAYS)
          : subDays(anchor, AGENDA_VISIBLE_DAYS),
        "yyyy-MM-dd",
      );
    }
    if (view === "week") {
      return format(direction === "next" ? addWeeks(anchor, 1) : subWeeks(anchor, 1), "yyyy-MM-dd");
    }
    if (view === "month") {
      return format(direction === "next" ? addMonths(anchor, 1) : subMonths(anchor, 1), "yyyy-MM-dd");
    }
    return format(direction === "next" ? addDays(anchor, 1) : subDays(anchor, 1), "yyyy-MM-dd");
  }

  visibleRange(
    view: CalendarView,
    anchorDate: string,
    timezone: string,
    weekStartDay: number,
  ): CalendarVisibleRange {
    if (view === "week") {
      const anchor = parseISO(`${anchorDate}T12:00:00`);
      const weekStart = startOfWeek(anchor, { weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6 });
      const weekEnd = endOfWeek(anchor, { weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6 });
      const startDate = format(weekStart, "yyyy-MM-dd");
      const endDate = format(weekEnd, "yyyy-MM-dd");
      return {
        startDate,
        endDate,
        start: localDateTimeToInstantIso(startDate, "00:00", timezone),
        end: localDateTimeToInstantIso(format(addDays(weekEnd, 1), "yyyy-MM-dd"), "00:00", timezone),
      };
    }

    if (view === "month") {
      const { startDate, endDate } = getMonthGridRange(
        anchorDate,
        weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      );
      return {
        startDate,
        endDate,
        start: localDateTimeToInstantIso(startDate, "00:00", timezone),
        end: localDateTimeToInstantIso(format(addDays(parseISO(`${endDate}T12:00:00`), 1), "yyyy-MM-dd"), "00:00", timezone),
      };
    }

    if (view === "agenda") {
      const startDate = anchorDate;
      const endDate = getAgendaVisibleEndDate(startDate);
      return {
        startDate,
        endDate,
        start: localDateTimeToInstantIso(startDate, "00:00", timezone),
        end: localDateTimeToInstantIso(format(addDays(parseISO(`${endDate}T12:00:00`), 1), "yyyy-MM-dd"), "00:00", timezone),
      };
    }

    const startDate = anchorDate;
    const endDate = anchorDate;
    return {
      startDate,
      endDate,
      start: localDateTimeToInstantIso(startDate, "00:00", timezone),
      end: localDateTimeToInstantIso(format(addDays(parseISO(`${anchorDate}T12:00:00`), 1), "yyyy-MM-dd"), "00:00", timezone),
    };
  }

  expandFetchRange(
    visible: CalendarVisibleRange,
    bufferDays: number,
    timezone: string,
  ): CalendarFetchRange {
    const startAnchor = parseISO(`${visible.startDate}T12:00:00`);
    const endAnchor = parseISO(`${visible.endDate}T12:00:00`);
    const bufferedStartDate = format(subDays(startAnchor, bufferDays), "yyyy-MM-dd");
    const bufferedEndDate = format(addDays(endAnchor, bufferDays), "yyyy-MM-dd");

    return {
      startDate: bufferedStartDate,
      endDate: bufferedEndDate,
      start: localDateTimeToInstantIso(bufferedStartDate, "00:00", timezone),
      end: localDateTimeToInstantIso(
        format(addDays(parseISO(`${bufferedEndDate}T12:00:00`), 1), "yyyy-MM-dd"),
        "00:00",
        timezone,
      ),
      bufferDays,
    };
  }
}
