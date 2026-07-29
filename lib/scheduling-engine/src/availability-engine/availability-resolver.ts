import type { AvailabilityContextSnapshot } from "../availability-engine/availability-context";
import type { ResolvedAvailability } from "../availability-engine/types";
import { AvailabilityPolicy } from "../availability-engine/availability-policy";
import {
  localPeriodsFromMinutes,
  mergeMinutePeriods,
  parseTimeToMinutes,
  subtractMinutePeriods,
  toMinutePeriod,
  type MinutePeriod,
} from "../availability-engine/period-utils";
import { TimezoneResolver } from "../availability-engine/timezone-resolver";
import type { AvailabilityException, WeekdayIndex } from "../types";

export class AvailabilityResolver {
  /** Pure, deterministic resolution from a loaded context snapshot. */
  static resolve(snapshot: AvailabilityContextSnapshot): ResolvedAvailability {
    const policy = AvailabilityPolicy.evaluate(snapshot);

    const base: ResolvedAvailability = {
      available: false,
      date: snapshot.date,
      timezone: policy.timezone,
      resourceId: snapshot.resourceId,
      serviceId: snapshot.serviceId,
      periods: [],
      reasons: [...policy.reasons],
      meta: {
        holidayTitle: policy.holidayTitle,
        weekday: policy.weekday ?? undefined,
      },
    };

    if (policy.blocked) {
      return base;
    }

    const weekday = policy.weekday as WeekdayIndex;
    const weeklyDay = snapshot.weeklyHours.find((row) => row.day_of_week === weekday);

    if (!weeklyDay) {
      return { ...base, reasons: [...base.reasons, "missing_weekly_schedule"] };
    }

    if (weeklyDay.is_closed || !weeklyDay.opens_at || !weeklyDay.closes_at) {
      return { ...base, reasons: [...base.reasons, "weekly_closed"] };
    }

    let periods: MinutePeriod[] = [
      toMinutePeriod(trimTime(weeklyDay.opens_at), trimTime(weeklyDay.closes_at)),
    ];

    const dayBreaks = snapshot.breaks.filter((item) => item.weekly_hours_id === weeklyDay.id);
    periods = subtractMinutePeriods(
      periods,
      dayBreaks.map((item) =>
        toMinutePeriod(trimTime(item.starts_at), trimTime(item.ends_at)),
      ),
    );

    const exceptionResult = AvailabilityResolver.applyExceptions(
      periods,
      snapshot.exceptions,
      snapshot.date,
      policy.timezone,
    );

    if (exceptionResult.fullDayBlock) {
      return {
        ...base,
        reasons: [...base.reasons, "exception_blocked"],
        meta: { ...base.meta, exceptionTitles: exceptionResult.exceptionTitles },
      };
    }

    periods = mergeMinutePeriods(exceptionResult.periods);
    const localPeriods = localPeriodsFromMinutes(periods);

    return {
      ...base,
      available: localPeriods.length > 0,
      periods: localPeriods,
      meta: { ...base.meta, exceptionTitles: exceptionResult.exceptionTitles },
    };
  }

  static applyExceptions(
    periods: MinutePeriod[],
    exceptions: AvailabilityException[],
    date: string,
    timezone: string,
  ): {
    periods: MinutePeriod[];
    fullDayBlock: boolean;
    exceptionTitles: string[];
  } {
    let current = periods;
    const titles: string[] = [];

    for (const exception of exceptions) {
      if (!AvailabilityResolver.exceptionAffectsDate(exception, date, timezone)) {
        continue;
      }

      titles.push(exception.title);

      if (exception.all_day) {
        return { periods: [], fullDayBlock: true, exceptionTitles: titles };
      }

      const removal = AvailabilityResolver.exceptionRemovalForDate(exception, date, timezone);
      if (!removal) continue;

      current = subtractMinutePeriods(current, [removal]);
    }

    return { periods: current, fullDayBlock: false, exceptionTitles: titles };
  }

  static exceptionRemovalForDate(
    exception: AvailabilityException,
    date: string,
    timezone: string,
  ): MinutePeriod | null {
    const startInstant = TimezoneResolver.parseInstant(exception.starts_at);
    const endInstant = TimezoneResolver.parseInstant(exception.ends_at);

    const startDate = TimezoneResolver.localDateForInstant(startInstant, timezone);
    const endDate = TimezoneResolver.localDateForInstant(endInstant, timezone);

    let removalStart = TimezoneResolver.localTimeForInstant(startInstant, timezone);
    let removalEnd = TimezoneResolver.localTimeForInstant(endInstant, timezone);

    if (startDate < date) removalStart = "00:00";
    if (endDate > date) removalEnd = "23:59";

    if (removalStart >= removalEnd) return null;

    try {
      return toMinutePeriod(removalStart, removalEnd);
    } catch {
      return { start: parseTimeToMinutes(removalStart), end: 24 * 60 - 1 };
    }
  }

  static exceptionAffectsDate(
    exception: AvailabilityException,
    date: string,
    timezone: string,
  ): boolean {
    const startDate = TimezoneResolver.localDateForInstant(
      TimezoneResolver.parseInstant(exception.starts_at),
      timezone,
    );
    const endDate = TimezoneResolver.localDateForInstant(
      TimezoneResolver.parseInstant(exception.ends_at),
      timezone,
    );
    return date >= startDate && date <= endDate;
  }
}

function trimTime(value: string): string {
  return value.slice(0, 5);
}
