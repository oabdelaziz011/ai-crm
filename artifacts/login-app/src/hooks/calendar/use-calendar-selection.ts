import { useCallback, useMemo, useRef } from "react";
import { CalendarSelectionService } from "@/lib/calendar/interaction/calendar-selection-service";
import type { CalendarSelectionModifiers } from "@/lib/calendar/interaction/calendar-selection-service";

export function useCalendarSelection(
  setSelection: (selection: {
    eventId?: string | null;
    eventIds?: string[];
    date?: string | null;
    resourceId?: string | null;
  }) => void,
) {
  const serviceRef = useRef(new CalendarSelectionService());

  const syncSelection = useCallback(
    (ids: string[]) => {
      setSelection({
        eventIds: ids,
        eventId: serviceRef.current.getPrimaryId(),
      });
    },
    [setSelection],
  );

  const selectEvent = useCallback(
    (eventId: string, modifiers: CalendarSelectionModifiers = {}) => {
      const ids = serviceRef.current.select(eventId, modifiers);
      syncSelection(ids);
    },
    [syncSelection],
  );

  const clearSelection = useCallback(() => {
    serviceRef.current.clear();
    syncSelection([]);
  }, [syncSelection]);

  const setOrderedEventIds = useCallback((eventIds: string[]) => {
    serviceRef.current.setOrderedEvents(eventIds);
  }, []);

  const isSelected = useCallback((eventId: string) => {
    return serviceRef.current.isSelected(eventId);
  }, []);

  return useMemo(
    () => ({
      selectEvent,
      clearSelection,
      setOrderedEventIds,
      isSelected,
    }),
    [clearSelection, isSelected, selectEvent, setOrderedEventIds],
  );
}
