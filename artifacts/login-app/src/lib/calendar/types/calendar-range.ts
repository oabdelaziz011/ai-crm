/** Visible window shown in the active view. */
export type CalendarVisibleRange = {
  start: string;
  end: string;
  startDate: string;
  endDate: string;
};

/** Expanded fetch window with query buffer for prefetch. */
export type CalendarFetchRange = CalendarVisibleRange & {
  bufferDays: number;
};

export type CalendarNavigationDirection = "previous" | "next";
