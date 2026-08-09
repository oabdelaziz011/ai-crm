import { TimezoneResolver } from "@/lib/scheduling/availability-engine/timezone-resolver";
import {
  addCalendarDays,
  getCalendarToday,
  resolveQueueTimezone,
} from "@/lib/scheduling/operations/utilities/calendar-day-range";

export type QueueDatePreset =
  | "today"
  | "tomorrow"
  | "yesterday"
  | "this_week"
  | "this_month"
  | "custom";

function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function monthEnd(date: string): string {
  const [year, month] = date.split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

/** Resolve inclusive YYYY-MM-DD range for queue date presets in company timezone. */
export function resolveQueueDateRange(
  preset: QueueDatePreset,
  customFrom?: string | null,
  customTo?: string | null,
  companyTimezone?: string | null,
): { dateFrom: string; dateTo: string; datePreset: QueueDatePreset } {
  const timezone = resolveQueueTimezone(companyTimezone);
  const today = getCalendarToday(timezone);

  if (preset === "custom") {
    const from = (customFrom ?? today).slice(0, 10);
    const to = (customTo ?? customFrom ?? from).slice(0, 10);
    return {
      datePreset: "custom",
      dateFrom: from <= to ? from : to,
      dateTo: from <= to ? to : from,
    };
  }

  if (preset === "tomorrow") {
    const key = addCalendarDays(today, 1);
    return { datePreset: preset, dateFrom: key, dateTo: key };
  }

  if (preset === "yesterday") {
    const key = addCalendarDays(today, -1);
    return { datePreset: preset, dateFrom: key, dateTo: key };
  }

  if (preset === "this_week") {
    const weekday = TimezoneResolver.weekdayForDate(today, timezone); // 0=Sun
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
    const start = addCalendarDays(today, mondayOffset);
    const end = addCalendarDays(start, 6);
    return { datePreset: preset, dateFrom: start, dateTo: end };
  }

  if (preset === "this_month") {
    return {
      datePreset: preset,
      dateFrom: monthStart(today),
      dateTo: monthEnd(today),
    };
  }

  return { datePreset: "today", dateFrom: today, dateTo: today };
}

export function formatAppointmentTime(value: unknown): string {
  if (value == null || value === "") return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/** Date-only display for the booking/appointment timestamp (pairs with formatAppointmentTime). */
export function formatAppointmentDate(value: unknown): string {
  if (value == null || value === "") return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatWaitingDuration(minutes: unknown): string {
  const total = Math.max(0, Math.floor(Number(minutes) || 0));
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export function formatDurationMinutes(minutes: unknown): string {
  if (minutes == null || minutes === "") return "—";
  const value = Math.max(0, Math.round(Number(minutes) || 0));
  if (!value) return "—";
  return `${value} min`;
}
