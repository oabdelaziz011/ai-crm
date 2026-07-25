import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { WeekdayIndex } from "@/lib/scheduling/types";

export type MonthGridCell = {
  date: string;
  inCurrentMonth: boolean;
  weekRow: number;
  weekCol: number;
};

/** Architecture hook for future multi-day month bars. */
export type MonthEventPlacement = {
  eventId: string;
  date: string;
  spanRole: "single" | "multi-day-start" | "multi-day-middle" | "multi-day-end";
};

export const MONTH_VISIBLE_EVENT_LIMIT = 3;

export function buildMonthGrid(
  anchorDate: string,
  weekStartDay: WeekdayIndex,
): MonthGridCell[] {
  const anchor = parseISO(`${anchorDate}T12:00:00`);
  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);
  const gridStart = startOfWeek(monthStart, {
    weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
  });
  const gridEnd = endOfWeek(monthEnd, {
    weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
  });

  const cells: MonthGridCell[] = [];
  let cursor = gridStart;
  let weekRow = 0;
  let weekCol = 0;

  while (cursor <= gridEnd) {
    cells.push({
      date: format(cursor, "yyyy-MM-dd"),
      inCurrentMonth: cursor >= monthStart && cursor <= monthEnd,
      weekRow,
      weekCol,
    });
    weekCol += 1;
    if (weekCol === 7) {
      weekCol = 0;
      weekRow += 1;
    }
    cursor = addDays(cursor, 1);
  }

  return cells;
}

export function getMonthGridRange(
  anchorDate: string,
  weekStartDay: WeekdayIndex,
): { startDate: string; endDate: string } {
  const anchor = parseISO(`${anchorDate}T12:00:00`);
  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);
  const gridStart = startOfWeek(monthStart, {
    weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
  });
  const gridEnd = endOfWeek(monthEnd, {
    weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
  });
  return {
    startDate: format(gridStart, "yyyy-MM-dd"),
    endDate: format(gridEnd, "yyyy-MM-dd"),
  };
}

export function classifyMonthEventSpan(
  eventStartDate: string,
  eventEndDate: string,
  cellDate: string,
): MonthEventPlacement["spanRole"] {
  if (eventStartDate === eventEndDate || eventStartDate === cellDate) {
    return eventStartDate === cellDate ? "single" : "single";
  }
  if (cellDate === eventStartDate) return "multi-day-start";
  if (cellDate === eventEndDate) return "multi-day-end";
  if (cellDate > eventStartDate && cellDate < eventEndDate) return "multi-day-middle";
  return "single";
}

export const AGENDA_VISIBLE_DAYS = 14;

export function buildAgendaDayKeys(startDate: string, dayCount = AGENDA_VISIBLE_DAYS): string[] {
  const keys: string[] = [];
  let cursor = parseISO(`${startDate}T12:00:00`);
  for (let index = 0; index < dayCount; index += 1) {
    keys.push(format(cursor, "yyyy-MM-dd"));
    cursor = addDays(cursor, 1);
  }
  return keys;
}

export function getAgendaVisibleEndDate(startDate: string, dayCount = AGENDA_VISIBLE_DAYS): string {
  return format(
    addDays(parseISO(`${startDate}T12:00:00`), dayCount - 1),
    "yyyy-MM-dd",
  );
}
