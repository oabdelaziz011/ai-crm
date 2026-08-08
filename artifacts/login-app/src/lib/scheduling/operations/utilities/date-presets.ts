import type { OperationsDatePreset } from "@/lib/scheduling/operations/types";
import {
  addCalendarDays,
  getCalendarDayRange,
  getCalendarToday,
} from "@/lib/scheduling/operations/utilities/calendar-day-range";
import { TimezoneResolver } from "@/lib/scheduling/availability-engine/timezone-resolver";
import { formatMoney } from "@/lib/billing/utilities/money";

export function resolveOperationsDate(
  preset: OperationsDatePreset,
  customDate: string,
  timezone = "UTC",
): string {
  const todayKey = getCalendarToday(timezone);
  switch (preset) {
    case "today":
      return todayKey;
    case "tomorrow":
      return addCalendarDays(todayKey, 1);
    case "this_week": {
      // Monday-start week for the company calendar day.
      const weekday = TimezoneResolver.weekdayForDate(todayKey, timezone); // 0=Sun
      const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
      return addCalendarDays(todayKey, mondayOffset);
    }
    case "custom":
    default:
      return customDate;
  }
}

/** @deprecated Prefer getCalendarDayRange(date, timezone). Kept for callers expecting rangeStart/rangeEnd. */
export function operationsDayRange(
  date: string,
  timezone = "UTC",
): { rangeStart: string; rangeEnd: string } {
  const { startUtc, endUtc } = getCalendarDayRange(date, timezone);
  return { rangeStart: startUtc, rangeEnd: endUtc };
}

export function formatOperationsCurrency(cents: number, currency?: string): string {
  return formatMoney(cents, currency);
}
