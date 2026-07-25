import type { SchedulingBookingStatus } from "@/lib/scheduling/booking-domain";
import type { WeekdayIndex } from "@/lib/scheduling/types";

export const CALENDAR_VIEWS = ["day", "week", "month", "agenda", "timeline"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

export type CalendarTimelineZoom = "compact" | "comfortable" | "expanded";

export type CalendarFilters = {
  resourceIds: string[] | "all";
  branchId: string | null;
  serviceIds: string[];
  statuses: SchedulingBookingStatus[];
};

export type CalendarSelection = {
  eventId: string | null;
  eventIds: string[];
  date: string | null;
  resourceId: string | null;
};

export type CalendarTimelineState = {
  resourceOrder: string[];
  zoomLevel: CalendarTimelineZoom;
};

/** Framework-independent calendar view state. */
export type CalendarViewState = {
  view: CalendarView;
  anchorDate: string;
  displayTimezone: string;
  locale: string;
  weekStartDay: WeekdayIndex;
  filters: CalendarFilters;
  timeline: CalendarTimelineState;
  selection: CalendarSelection;
};

export const DEFAULT_CALENDAR_STATUSES: SchedulingBookingStatus[] = [
  "pending",
  "confirmed",
  "completed",
  "no_show",
];

export function createDefaultCalendarViewState(
  overrides: Partial<CalendarViewState> = {},
): CalendarViewState {
  return {
    view: "week",
    anchorDate: new Date().toISOString().slice(0, 10),
    displayTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale: "en",
    weekStartDay: 1,
    filters: {
      resourceIds: "all",
      branchId: null,
      serviceIds: [],
      statuses: [...DEFAULT_CALENDAR_STATUSES],
    },
    timeline: {
      resourceOrder: [],
      zoomLevel: "comfortable",
    },
    selection: {
      eventId: null,
      eventIds: [],
      date: null,
      resourceId: null,
    },
    ...overrides,
  };
}
