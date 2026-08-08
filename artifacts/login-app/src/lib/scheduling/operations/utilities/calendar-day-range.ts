import { TimezoneResolver } from "@/lib/scheduling/availability-engine/timezone-resolver";
import { localDateTimeToInstant } from "@/lib/scheduling/booking-domain/booking-time-utils";

export type CalendarDayRange = {
  /** Inclusive UTC instant for 00:00:00 on the calendar day in `timezone`. */
  startUtc: string;
  /** Exclusive UTC instant for 00:00:00 on the next calendar day in `timezone`. */
  endUtc: string;
};

/** Add whole calendar days to a YYYY-MM-DD key (date-only arithmetic). */
export function addCalendarDays(date: string, days: number): string {
  if (!TimezoneResolver.isValidDateString(date)) {
    throw new Error(`Invalid calendar date: ${date}`);
  }
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, "0");
  const d = String(next.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Convert a calendar day (YYYY-MM-DD) in an IANA timezone to exclusive UTC bounds.
 * Example (Africa/Cairo, UTC+3): 2026-08-05 → start 2026-08-04T21:00:00.000Z, end 2026-08-05T21:00:00.000Z
 */
export function getCalendarDayRange(date: string, companyTimezone: string): CalendarDayRange {
  if (!TimezoneResolver.isValidDateString(date)) {
    throw new Error(`Invalid calendar date: ${date}`);
  }
  const timezone =
    companyTimezone && TimezoneResolver.isValid(companyTimezone) ? companyTimezone : "UTC";

  const start = localDateTimeToInstant(date, "00:00", timezone);
  const end = localDateTimeToInstant(addCalendarDays(date, 1), "00:00", timezone);

  return {
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
  };
}

/** Inclusive multi-day range as a single exclusive UTC window. */
export function getCalendarDateRangeBounds(
  dateFrom: string,
  dateTo: string,
  companyTimezone: string,
): CalendarDayRange {
  const from = dateFrom <= dateTo ? dateFrom : dateTo;
  const to = dateFrom <= dateTo ? dateTo : dateFrom;
  const start = getCalendarDayRange(from, companyTimezone).startUtc;
  const end = getCalendarDayRange(to, companyTimezone).endUtc;
  return { startUtc: start, endUtc: end };
}

/** Today's YYYY-MM-DD in the company timezone (never UTC toISOString date). */
export function getCalendarToday(companyTimezone: string, now = new Date()): string {
  const timezone =
    companyTimezone && TimezoneResolver.isValid(companyTimezone) ? companyTimezone : "UTC";
  return TimezoneResolver.localDateForInstant(now, timezone);
}

export function resolveQueueTimezone(
  preferredTimezone?: string | null,
  fallbackTimezone?: string | null,
): string {
  if (preferredTimezone && TimezoneResolver.isValid(preferredTimezone)) {
    return preferredTimezone;
  }
  if (fallbackTimezone && TimezoneResolver.isValid(fallbackTimezone)) {
    return fallbackTimezone;
  }
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected && TimezoneResolver.isValid(detected)) return detected;
  } catch {
    // ignore
  }
  return "UTC";
}
