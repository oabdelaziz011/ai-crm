import { TimezoneResolver } from "@/lib/scheduling/availability-engine/timezone-resolver";
import { parseTimeToMinutes } from "@/lib/scheduling/availability-engine/period-utils";

/** Convert local calendar date + HH:mm in IANA timezone to UTC instant ISO string. */
export function localDateTimeToInstantIso(
  date: string,
  time: string,
  timezone: string,
): string {
  return localDateTimeToInstant(date, time, timezone).toISOString();
}

export function localDateTimeToInstant(date: string, time: string, timezone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);

  let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const probe = new Date(utcMs);
    const localDate = TimezoneResolver.localDateForInstant(probe, timezone);
    const localTime = TimezoneResolver.localTimeForInstant(probe, timezone);

    if (localDate === date && localTime === time) {
      return probe;
    }

    const targetDayMs = Date.parse(`${date}T00:00:00.000Z`);
    const localDayMs = Date.parse(`${localDate}T00:00:00.000Z`);
    const dayDeltaMinutes = Math.round((targetDayMs - localDayMs) / 60_000);
    const targetMinutes = parseTimeToMinutes(time);
    const localMinutes = parseTimeToMinutes(localTime);
    const deltaMinutes = dayDeltaMinutes + (targetMinutes - localMinutes);

    utcMs += deltaMinutes * 60_000;
  }

  return new Date(utcMs);
}

export function addMinutesToInstantIso(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}

/** Whole minutes from referenceNow until appointment start (negative if already started). */
export function minutesUntilAppointment(startAtIso: string, referenceNow: Date): number {
  return Math.floor((Date.parse(startAtIso) - referenceNow.getTime()) / 60_000);
}

export function instantOverlaps(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  const aStartMs = Date.parse(aStart);
  const aEndMs = Date.parse(aEnd);
  const bStartMs = Date.parse(bStart);
  const bEndMs = Date.parse(bEnd);
  return aStartMs < bEndMs && aEndMs > bStartMs;
}
