/**
 * Flexible follow-up schedule helpers.
 * maxAttempts = total follow-up messages including the first (not “extra” after first).
 */

import {
  DEFAULT_SALES_FOLLOW_UP_SETTINGS,
  normalizeSalesFollowUpSettings,
  type SalesFollowUpSettings,
} from "./sales-follow-up.js";

export type SalesFollowUpDurationUnit = "minutes" | "hours" | "days";

export type SalesFollowUpScheduleStep = {
  /** 1-based attempt number */
  attemptNumber: number;
  amount: number;
  unit: SalesFollowUpDurationUnit;
  enabled: boolean;
};

const UNIT_TO_MINUTES: Record<SalesFollowUpDurationUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 24 * 60,
};

/** Default editable ladder when a company enables automation with empty subsequent intervals. */
export const DEFAULT_SALES_FOLLOW_UP_SCHEDULE_STEPS: SalesFollowUpScheduleStep[] = [
  { attemptNumber: 1, amount: 24, unit: "hours", enabled: true },
  { attemptNumber: 2, amount: 3, unit: "days", enabled: true },
  { attemptNumber: 3, amount: 7, unit: "days", enabled: true },
];

export function minutesFromDuration(amount: number, unit: SalesFollowUpDurationUnit): number {
  const safeAmount = Math.max(1, Math.trunc(amount || 1));
  return safeAmount * UNIT_TO_MINUTES[unit];
}

export function durationFromMinutes(totalMinutes: number): { amount: number; unit: SalesFollowUpDurationUnit } {
  const minutes = Math.max(15, Math.trunc(totalMinutes || 15));
  if (minutes % (24 * 60) === 0) {
    return { amount: minutes / (24 * 60), unit: "days" };
  }
  if (minutes % 60 === 0) {
    return { amount: minutes / 60, unit: "hours" };
  }
  return { amount: minutes, unit: "minutes" };
}

/**
 * Expand settings into ordered schedule steps.
 * Attempt 1 uses firstDelayMinutes; attempts 2..N use subsequentIntervalMinutes.
 */
export function salesFollowUpScheduleSteps(settings: SalesFollowUpSettings): SalesFollowUpScheduleStep[] {
  const normalized = normalizeSalesFollowUpSettings(settings);
  const maxAttempts = normalized.maxAttempts;
  const steps: SalesFollowUpScheduleStep[] = [];
  const first = durationFromMinutes(normalized.firstDelayMinutes);
  steps.push({
    attemptNumber: 1,
    amount: first.amount,
    unit: first.unit,
    enabled: true,
  });
  for (let attempt = 2; attempt <= maxAttempts; attempt += 1) {
    const idx = attempt - 2;
    const minutes =
      normalized.subsequentIntervalMinutes[idx] ??
      normalized.subsequentIntervalMinutes[normalized.subsequentIntervalMinutes.length - 1] ??
      normalized.firstDelayMinutes;
    const parsed = durationFromMinutes(minutes);
    steps.push({
      attemptNumber: attempt,
      amount: parsed.amount,
      unit: parsed.unit,
      enabled: true,
    });
  }
  return steps;
}

/** Collapse UI steps back into persisted settings fields. */
export function settingsFromScheduleSteps(
  base: Partial<SalesFollowUpSettings>,
  steps: SalesFollowUpScheduleStep[],
): SalesFollowUpSettings {
  const enabledSteps = steps
    .filter((step) => step.enabled && step.amount > 0)
    .sort((a, b) => a.attemptNumber - b.attemptNumber);
  const first = enabledSteps[0] ?? DEFAULT_SALES_FOLLOW_UP_SCHEDULE_STEPS[0]!;
  const rest = enabledSteps.slice(1);
  return normalizeSalesFollowUpSettings({
    ...base,
    firstDelayMinutes: minutesFromDuration(first.amount, first.unit),
    subsequentIntervalMinutes: rest.map((step) => minutesFromDuration(step.amount, step.unit)),
    maxAttempts: Math.max(1, Math.min(5, enabledSteps.length || 1)),
  });
}

/**
 * Due time for attempt N relative to an anchor (e.g. last customer message / qualification).
 * Each step is an absolute delay from the same anchor (24h / 3d / 7d), not a sum of prior steps.
 */
export function computeSalesFollowUpDueAt(
  anchor: Date,
  attemptNumber: number,
  settings: SalesFollowUpSettings,
): Date {
  const steps = salesFollowUpScheduleSteps(settings);
  const target = Math.max(1, Math.trunc(attemptNumber));
  const step =
    steps.find((entry) => entry.attemptNumber === target && entry.enabled) ??
    steps.find((entry) => entry.enabled) ??
    null;
  const totalMinutes = step
    ? minutesFromDuration(step.amount, step.unit)
    : DEFAULT_SALES_FOLLOW_UP_SETTINGS.firstDelayMinutes;
  return new Date(anchor.getTime() + Math.max(15, totalMinutes) * 60_000);
}

/** Apply company business hours: if outside window, push to next open start. */
export function alignDueAtToBusinessHours(dueAt: Date, settings: SalesFollowUpSettings): Date {
  const normalized = normalizeSalesFollowUpSettings(settings);
  const days = normalized.businessHours.days.length
    ? normalized.businessHours.days
    : [1, 2, 3, 4, 5];
  const [startHour, startMinute] = normalized.businessHours.start.split(":").map(Number);
  const [endHour, endMinute] = normalized.businessHours.end.split(":").map(Number);
  const tz = normalized.timezone || "UTC";

  let cursor = new Date(dueAt.getTime());
  for (let i = 0; i < 14; i += 1) {
    const parts = getZonedParts(cursor, tz);
    const minutesOfDay = parts.hour * 60 + parts.minute;
    const start = (startHour || 0) * 60 + (startMinute || 0);
    const end = (endHour || 17) * 60 + (endMinute || 0);
    const dayOk = days.includes(parts.weekday);
    if (dayOk && minutesOfDay >= start && minutesOfDay < end) {
      return cursor;
    }
    // Jump to next day's start (approx via UTC offset compensation).
    const next = new Date(cursor.getTime());
    if (!dayOk || minutesOfDay >= end) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    next.setUTCHours(startHour || 9, startMinute || 0, 0, 0);
    cursor = next;
  }
  return dueAt;
}

function getZonedParts(date: Date, timeZone: string): {
  weekday: number;
  hour: number;
  minute: number;
} {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = Object.fromEntries(
      fmt.formatToParts(date).map((part) => [part.type, part.value]),
    ) as Record<string, string>;
    const weekdayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    return {
      weekday: weekdayMap[parts.weekday ?? "Mon"] ?? 1,
      hour: Number(parts.hour === "24" ? "0" : parts.hour) || 0,
      minute: Number(parts.minute) || 0,
    };
  } catch {
    return {
      weekday: date.getUTCDay(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
    };
  }
}

export function isWithinSalesFollowUpBusinessHours(now: Date, settings: SalesFollowUpSettings): boolean {
  const aligned = alignDueAtToBusinessHours(now, settings);
  return Math.abs(aligned.getTime() - now.getTime()) < 60_000;
}
