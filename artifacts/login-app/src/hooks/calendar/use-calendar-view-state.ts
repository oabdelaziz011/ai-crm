import { useCallback, useMemo, useReducer } from "react";
import { useTranslation } from "react-i18next";
import {
  createDefaultCalendarViewState,
  type CalendarFilters,
  type CalendarSelection,
  type CalendarView,
  type CalendarTimelineZoom,
  type CalendarViewState,
} from "@/lib/calendar/types/calendar-view-state";
import type { WeekdayIndex } from "@/lib/scheduling/types";

type CalendarViewAction =
  | { type: "set-view"; view: CalendarView }
  | { type: "set-anchor"; anchorDate: string }
  | { type: "set-timezone"; displayTimezone: string }
  | { type: "set-week-start"; weekStartDay: WeekdayIndex }
  | { type: "set-filters"; filters: Partial<CalendarFilters> }
  | { type: "set-selection"; selection: Partial<CalendarSelection> }
  | { type: "set-zoom"; zoomLevel: CalendarTimelineZoom }
  | { type: "reset"; state: CalendarViewState };

function calendarViewReducer(
  state: CalendarViewState,
  action: CalendarViewAction,
): CalendarViewState {
  switch (action.type) {
    case "set-view":
      return { ...state, view: action.view };
    case "set-anchor":
      return { ...state, anchorDate: action.anchorDate };
    case "set-timezone":
      return { ...state, displayTimezone: action.displayTimezone };
    case "set-week-start":
      return { ...state, weekStartDay: action.weekStartDay };
    case "set-filters":
      return { ...state, filters: { ...state.filters, ...action.filters } };
    case "set-selection":
      return { ...state, selection: { ...state.selection, ...action.selection } };
    case "set-zoom":
      return {
        ...state,
        timeline: { ...state.timeline, zoomLevel: action.zoomLevel },
      };
    case "reset":
      return action.state;
    default:
      return state;
  }
}

export function useCalendarViewState(initial?: Partial<CalendarViewState>) {
  const { i18n } = useTranslation();
  const [state, dispatch] = useReducer(
    calendarViewReducer,
    undefined,
    () =>
      createDefaultCalendarViewState({
        locale: i18n.language,
        ...initial,
      }),
  );

  const setView = useCallback((view: CalendarView) => {
    dispatch({ type: "set-view", view });
  }, []);

  const setAnchorDate = useCallback((anchorDate: string) => {
    dispatch({ type: "set-anchor", anchorDate });
  }, []);

  const setDisplayTimezone = useCallback((displayTimezone: string) => {
    dispatch({ type: "set-timezone", displayTimezone });
  }, []);

  const setWeekStartDay = useCallback((weekStartDay: WeekdayIndex) => {
    dispatch({ type: "set-week-start", weekStartDay });
  }, []);

  const setFilters = useCallback((filters: Partial<CalendarFilters>) => {
    dispatch({ type: "set-filters", filters });
  }, []);

  const setSelection = useCallback((selection: Partial<CalendarSelection>) => {
    dispatch({ type: "set-selection", selection });
  }, []);

  const setZoomLevel = useCallback((zoomLevel: CalendarTimelineZoom) => {
    dispatch({ type: "set-zoom", zoomLevel });
  }, []);

  const resetViewState = useCallback((next: CalendarViewState) => {
    dispatch({ type: "reset", state: next });
  }, []);

  return useMemo(
    () => ({
      viewState: state,
      setView,
      setAnchorDate,
      setDisplayTimezone,
      setWeekStartDay,
      setFilters,
      setSelection,
      setZoomLevel,
      resetViewState,
    }),
    [
      state,
      setView,
      setAnchorDate,
      setDisplayTimezone,
      setWeekStartDay,
      setFilters,
      setSelection,
      setZoomLevel,
      resetViewState,
    ],
  );
}
