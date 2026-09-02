import { TimezoneResolver } from "@/lib/scheduling/availability-engine/timezone-resolver";
import {
  instantOverlaps,
  localDateTimeToInstantIso,
} from "@/lib/scheduling/booking-domain/booking-time-utils";
import { getCalendarDayRange } from "@/lib/scheduling/operations/utilities/calendar-day-range";
import type { BusinessExceptionScope } from "./types";
import { BusinessApologyExceptionError } from "./types";

const TIME_RE = /^\d{2}:\d{2}$/;

export function normalizeHhMm(value: string): string {
  const trimmed = value.trim().slice(0, 5);
  if (!TIME_RE.test(trimmed)) {
    throw new BusinessApologyExceptionError("Invalid time format", "invalid_time_range");
  }
  return trimmed;
}

export function resolveExceptionWindow(input: {
  exceptionDate: string;
  scope: BusinessExceptionScope;
  startTime?: string | null;
  endTime?: string | null;
  timezone: string;
}): { windowStartAt: string; windowEndAt: string; startTime: string | null; endTime: string | null } {
  if (!TimezoneResolver.isValidDateString(input.exceptionDate)) {
    throw new BusinessApologyExceptionError("Invalid exception date", "invalid_input");
  }

  const timezone =
    input.timezone && TimezoneResolver.isValid(input.timezone) ? input.timezone : "UTC";

  if (input.scope === "full_day") {
    const day = getCalendarDayRange(input.exceptionDate, timezone);
    return {
      windowStartAt: day.startUtc,
      windowEndAt: day.endUtc,
      startTime: null,
      endTime: null,
    };
  }

  const startTime = normalizeHhMm(input.startTime ?? "");
  const endTime = normalizeHhMm(input.endTime ?? "");
  if (startTime >= endTime) {
    throw new BusinessApologyExceptionError("Start time must be before end time", "invalid_time_range");
  }

  return {
    windowStartAt: localDateTimeToInstantIso(input.exceptionDate, startTime, timezone),
    windowEndAt: localDateTimeToInstantIso(input.exceptionDate, endTime, timezone),
    startTime,
    endTime,
  };
}

export function bookingOverlapsExceptionWindow(
  bookingStartAt: string,
  bookingEndAt: string,
  windowStartAt: string,
  windowEndAt: string,
): boolean {
  return instantOverlaps(bookingStartAt, bookingEndAt, windowStartAt, windowEndAt);
}

export function buildApologyIdempotencyFingerprint(input: {
  serviceId: string;
  exceptionDate: string;
  scope: BusinessExceptionScope;
  startTime?: string | null;
  endTime?: string | null;
  comment: string;
}): string {
  const start = input.scope === "hours" ? (input.startTime ?? "") : "";
  const end = input.scope === "hours" ? (input.endTime ?? "") : "";
  return [
    input.serviceId,
    input.exceptionDate,
    input.scope,
    start,
    end,
    input.comment.trim(),
  ].join("|");
}
