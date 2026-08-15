import type { WeekdayIndex } from "../types";

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

  /**
   * Resolve effective IANA timezone.
   * Preference: resource → branch → booking rules → UTC.
   * Resource/branch values of "UTC" are treated as unset so company booking-rules
   * timezones (e.g. Africa/Cairo) win — resources are often created with UTC default.
   */
  static resolveEffectiveTimezone(
    resourceTimezone: string | null | undefined,
    branchTimezone: string | null | undefined,
    rulesTimezone: string | null | undefined,
  ): string {
    const candidates = [
      TimezoneResolver.normalizeConfiguredTimezone(resourceTimezone),
      TimezoneResolver.normalizeConfiguredTimezone(branchTimezone),
      TimezoneResolver.normalizeConfiguredTimezone(rulesTimezone, { allowUtc: true }),
      "UTC",
    ];
    for (const candidate of candidates) {
      if (candidate && TimezoneResolver.isValid(candidate)) {
        return candidate;
      }
    }
    return "UTC";
  }

  /** Treat bare UTC on resource/branch as "not configured". */
  static normalizeConfiguredTimezone(
    timezone: string | null | undefined,
    options?: { allowUtc?: boolean },
  ): string | null {
    if (!timezone || !timezone.trim()) return null;
    const trimmed = timezone.trim();
    if (!options?.allowUtc && trimmed.toUpperCase() === "UTC") return null;
    return trimmed;
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
