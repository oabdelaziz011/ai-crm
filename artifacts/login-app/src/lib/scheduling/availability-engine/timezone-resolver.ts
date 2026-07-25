import type { WeekdayIndex } from "@/lib/scheduling/types";

const WEEKDAY_MAP: Record<string, WeekdayIndex> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export class TimezoneResolver {
  static isValid(timezone: string): boolean {
    if (!timezone?.trim()) return false;
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }

  /** Resolve effective IANA timezone: resource → branch → booking rules fallback. */
  static resolveEffectiveTimezone(
    resourceTimezone: string | null | undefined,
    branchTimezone: string | null | undefined,
    rulesTimezone: string | null | undefined,
  ): string {
    const candidates = [resourceTimezone, branchTimezone, rulesTimezone, "UTC"];
    for (const candidate of candidates) {
      if (candidate && TimezoneResolver.isValid(candidate)) {
        return candidate;
      }
    }
    return "UTC";
  }

  static isValidDateString(date: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`));
  }

  /** Calendar weekday (0=Sun) for YYYY-MM-DD interpreted in the given timezone. */
  static weekdayForDate(date: string, timezone: string): WeekdayIndex {
    const [year, month, day] = date.split("-").map(Number);
    const anchor = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    });
    const weekday = formatter.format(anchor).slice(0, 3);
    return WEEKDAY_MAP[weekday] ?? 0;
  }

  /** Local calendar date (YYYY-MM-DD) for an instant in a timezone. */
  static localDateForInstant(instant: Date, timezone: string): string {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(instant);
  }

  /** Local HH:mm for an instant in a timezone. */
  static localTimeForInstant(instant: Date, timezone: string): string {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(instant);
    const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
    const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
    return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  }

  static parseInstant(value: string): Date {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error("INVALID_INSTANT");
    }
    return parsed;
  }
}
