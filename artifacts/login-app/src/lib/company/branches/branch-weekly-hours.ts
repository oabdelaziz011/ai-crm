import {
  DEFAULT_WEEKLY_HOURS,
  WEEKDAY_INDICES,
  type WeekdayIndex,
} from "@/lib/scheduling/types";
import type { WeeklyScheduleFormValues } from "@/lib/scheduling/validation/schemas";

export type BranchWeeklyDay = {
  day_of_week: WeekdayIndex;
  is_closed: boolean;
  opens_at: string | null;
  closes_at: string | null;
};

function trimTime(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 5);
}

export function defaultBranchWeeklyHours(): BranchWeeklyDay[] {
  return WEEKDAY_INDICES.map((day) => {
    const defaults = DEFAULT_WEEKLY_HOURS.find((item) => item.day_of_week === day)!;
    return {
      day_of_week: day,
      is_closed: defaults.is_closed,
      opens_at: defaults.opens_at ?? null,
      closes_at: defaults.closes_at ?? null,
    };
  });
}

export function readBranchWeeklyHours(
  settings: Record<string, unknown> | null | undefined,
): BranchWeeklyDay[] {
  const raw = settings?.weeklyHours;
  if (!Array.isArray(raw) || raw.length === 0) {
    return defaultBranchWeeklyHours();
  }

  const byDay = new Map<number, BranchWeeklyDay>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const day = Number(row.day_of_week);
    if (!WEEKDAY_INDICES.includes(day as WeekdayIndex)) continue;
    byDay.set(day, {
      day_of_week: day as WeekdayIndex,
      is_closed: Boolean(row.is_closed),
      opens_at: trimTime(typeof row.opens_at === "string" ? row.opens_at : null),
      closes_at: trimTime(typeof row.closes_at === "string" ? row.closes_at : null),
    });
  }

  return WEEKDAY_INDICES.map((day) => {
    const existing = byDay.get(day);
    if (existing) return existing;
    const defaults = DEFAULT_WEEKLY_HOURS.find((item) => item.day_of_week === day)!;
    return {
      day_of_week: day,
      is_closed: defaults.is_closed,
      opens_at: defaults.opens_at ?? null,
      closes_at: defaults.closes_at ?? null,
    };
  });
}

export function toWeeklyScheduleForm(days: BranchWeeklyDay[]): WeeklyScheduleFormValues {
  return {
    days: days.map((day) => ({
      day_of_week: day.day_of_week,
      is_closed: day.is_closed,
      opens_at: day.is_closed ? null : day.opens_at || "09:00",
      closes_at: day.is_closed ? null : day.closes_at || "17:00",
      breaks: [],
    })),
  };
}

export function weeklyScheduleToBranchHours(
  form: WeeklyScheduleFormValues,
): BranchWeeklyDay[] {
  return form.days.map((day) => ({
    day_of_week: day.day_of_week,
    is_closed: day.is_closed,
    opens_at: day.is_closed ? null : trimTime(day.opens_at),
    closes_at: day.is_closed ? null : trimTime(day.closes_at),
  }));
}

export function mergeBranchSettingsWithHours(
  settings: Record<string, unknown> | null | undefined,
  hours: BranchWeeklyDay[],
): Record<string, unknown> {
  return {
    ...(settings && typeof settings === "object" ? settings : {}),
    weeklyHours: hours,
  };
}

export function summarizeBranchHours(days: BranchWeeklyDay[]): string {
  const openDays = days.filter((day) => !day.is_closed);
  if (openDays.length === 0) return "";
  const first = openDays[0]!;
  const sameHours = openDays.every(
    (day) => day.opens_at === first.opens_at && day.closes_at === first.closes_at,
  );
  if (sameHours && first.opens_at && first.closes_at) {
    return `${openDays.length}d · ${first.opens_at}–${first.closes_at}`;
  }
  return `${openDays.length} open`;
}
