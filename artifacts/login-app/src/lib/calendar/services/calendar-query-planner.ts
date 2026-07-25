import type { CalendarView } from "@/lib/calendar/types/calendar-view-state";
import type { CalendarFetchRange, CalendarVisibleRange } from "@/lib/calendar/types/calendar-range";
import { CalendarNavigationService } from "@/lib/calendar/services/calendar-navigation-service";

const BUFFER_DAYS: Record<CalendarView, number> = {
  day: 1,
  week: 7,
  month: 14,
  agenda: 14,
  timeline: 7,
};

export class CalendarQueryPlanner {
  constructor(
    private readonly navigation = new CalendarNavigationService(),
  ) {}

  planFetchRange(
    view: CalendarView,
    anchorDate: string,
    displayTimezone: string,
    weekStartDay: number,
  ): CalendarFetchRange {
    const visible = this.navigation.visibleRange(view, anchorDate, displayTimezone, weekStartDay);
    const bufferDays = BUFFER_DAYS[view];
    return this.navigation.expandFetchRange(visible, bufferDays, displayTimezone);
  }

  planVisibleRange(
    view: CalendarView,
    anchorDate: string,
    displayTimezone: string,
    weekStartDay: number,
  ): CalendarVisibleRange {
    return this.navigation.visibleRange(view, anchorDate, displayTimezone, weekStartDay);
  }
}
