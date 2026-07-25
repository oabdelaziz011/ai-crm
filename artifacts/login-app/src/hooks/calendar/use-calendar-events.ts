import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCalendarServices } from "@/lib/calendar";
import { calendarEventsKey } from "@/lib/calendar/cache/calendar-query-keys";
import type { CalendarPermissions } from "@/lib/calendar/policies/calendar-interaction-policy";
import type { CalendarViewState } from "@/lib/calendar/types/calendar-view-state";
import { useSchedulingBookingRules } from "@/hooks/scheduling/use-scheduling-booking-rules";

const { calendar: calendarService } = getCalendarServices();

export type UseCalendarEventsOptions = {
  companyId: string | null;
  viewState: CalendarViewState;
  permissions?: CalendarPermissions;
};

export function useCalendarEvents({
  companyId,
  viewState,
  permissions = {},
}: UseCalendarEventsOptions) {
  const { data: bookingRules } = useSchedulingBookingRules(companyId);

  const displayTimezone = useMemo(
    () =>
      calendarService.resolveDisplayTimezone(
        viewState,
        bookingRules?.timezone ?? null,
      ),
    [viewState, bookingRules?.timezone],
  );

  const effectiveViewState = useMemo(
    () =>
      viewState.displayTimezone === displayTimezone
        ? viewState
        : { ...viewState, displayTimezone },
    [viewState, displayTimezone],
  );

  const fetchRange = useMemo(
    () => calendarService.getFetchRange(effectiveViewState),
    [effectiveViewState],
  );

  const visibleRange = useMemo(
    () => calendarService.getVisibleRange(effectiveViewState),
    [effectiveViewState],
  );

  const queryKey = calendarEventsKey(
    companyId,
    effectiveViewState.view,
    fetchRange.start,
    fetchRange.end,
    effectiveViewState.filters,
  );

  const query = useQuery({
    queryKey,
    enabled: Boolean(companyId),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const events = await calendarService.getEventsForRange(
        companyId!,
        fetchRange,
        effectiveViewState.filters,
        displayTimezone,
        { permissions, rulesTimezone: bookingRules?.timezone ?? null },
      );
      return calendarService.filterEventsToVisible(events, visibleRange);
    },
  });

  const eventsByDay = useMemo(
    () =>
      query.data
        ? calendarService.groupEventsByDay(query.data, displayTimezone)
        : new Map(),
    [query.data, displayTimezone],
  );

  const eventsByResource = useMemo(
    () => (query.data ? calendarService.groupEventsByResource(query.data) : new Map()),
    [query.data],
  );

  return {
    ...query,
    events: query.data ?? [],
    eventsByDay,
    eventsByResource,
    visibleRange,
    fetchRange,
    displayTimezone,
    effectiveViewState,
    bookingRules,
  };
}
