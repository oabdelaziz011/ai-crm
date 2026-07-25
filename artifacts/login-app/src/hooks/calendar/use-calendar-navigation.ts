import { useCallback, useMemo } from "react";
import { getCalendarServices } from "@/lib/calendar";
import type { CalendarNavigationDirection } from "@/lib/calendar/types/calendar-range";
import type { CalendarViewState } from "@/lib/calendar/types/calendar-view-state";

const { navigation, calendar: calendarService } = getCalendarServices();

export function useCalendarNavigation(viewState: CalendarViewState) {
  const visibleRange = useMemo(
    () => calendarService.getVisibleRange(viewState),
    [viewState],
  );

  const fetchRange = useMemo(
    () => calendarService.getFetchRange(viewState),
    [viewState],
  );

  const goToToday = useCallback(() => {
    return navigation.goToToday(new Date(), viewState.displayTimezone);
  }, [viewState.displayTimezone]);

  const shiftAnchor = useCallback(
    (direction: CalendarNavigationDirection) => {
      return navigation.shiftAnchor(viewState.view, viewState.anchorDate, direction);
    },
    [viewState.view, viewState.anchorDate],
  );

  const jumpToDate = useCallback((date: string) => {
    return navigation.jumpToDate(date);
  }, []);

  return {
    visibleRange,
    fetchRange,
    goToToday,
    shiftAnchor,
    jumpToDate,
  };
}
