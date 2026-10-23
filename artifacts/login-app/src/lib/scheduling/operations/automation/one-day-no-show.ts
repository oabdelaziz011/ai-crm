import { TimezoneResolver } from "@/lib/scheduling/availability-engine/timezone-resolver";
import { getCalendarToday } from "@/lib/scheduling/operations/utilities/calendar-day-range";
import { resolveQueueTimezone } from "@/lib/scheduling/operations/utilities/calendar-day-range";

/** Grace stored on the no-show event: one calendar day after the appointment date. */
export const ONE_DAY_NO_SHOW_GRACE_MINUTES = 24 * 60;

/**
 * True when the appointment's calendar date, in its timezone, is before today's
 * calendar date. The day after the appointment is the first day it counts as missed.
 */
export function isAppointmentDatePassedByOneDay(
  startAt: string,
  timeZone: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) return false;
  const zone = resolveQueueTimezone(timeZone);
  if (!TimezoneResolver.isValid(zone)) return false;
  const appointmentDate = TimezoneResolver.localDateForInstant(start, zone);
  const today = getCalendarToday(zone, now);
  return appointmentDate < today;
}

export type OneDayNoShowCandidate = {
  id: string;
  status: string;
  startAt: string;
  timezone?: string | null;
};

/** Confirmed visits whose appointment date is already a previous calendar day. */
export function selectOneDayNoShowCandidates<T extends OneDayNoShowCandidate>(
  rows: T[],
  now: Date = new Date(),
): T[] {
  return rows.filter(
    (row) =>
      row.status === "confirmed" &&
      isAppointmentDatePassedByOneDay(row.startAt, row.timezone, now),
  );
}
