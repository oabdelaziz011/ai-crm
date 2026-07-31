import type {
  DashboardCustomRange,
  DashboardPeriodWindow,
  DashboardTimeRangeKey,
} from "./analytics-types.js";

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date): Date {
  const next = new Date(date);
  next.setUTCHours(23, 59, 59, 999);
  return next;
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

function startOfQuarter(date: Date): Date {
  const quarter = Math.floor(date.getUTCMonth() / 3);
  return new Date(Date.UTC(date.getUTCFullYear(), quarter * 3, 1));
}

function endOfQuarter(date: Date): Date {
  const start = startOfQuarter(date);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 0, 23, 59, 59, 999));
}

function startOfYear(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
}

function endOfYear(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 11, 31, 23, 59, 59, 999));
}

function shiftDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function periodWindow(
  key: DashboardTimeRangeKey,
  label: string,
  startAt: Date,
  endAt: Date,
): DashboardPeriodWindow {
  return {
    key,
    label,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
  };
}

function previousWindow(current: DashboardPeriodWindow): DashboardPeriodWindow {
  const start = new Date(current.startAt);
  const end = new Date(current.endAt);
  const durationMs = end.getTime() - start.getTime();
  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - durationMs);
  return {
    key: current.key,
    label: `Previous ${current.label}`,
    startAt: previousStart.toISOString(),
    endAt: previousEnd.toISOString(),
  };
}

export class ComparisonEngine {
  resolveCurrentPeriod(
    timeRange: DashboardTimeRangeKey,
    customRange?: DashboardCustomRange,
    referenceDate: Date = new Date(),
  ): DashboardPeriodWindow {
    const now = referenceDate;

    if (timeRange === "custom") {
      if (!customRange) {
        throw new Error("Custom time range requires startAt and endAt.");
      }
      return periodWindow("custom", "Custom Range", new Date(customRange.startAt), new Date(customRange.endAt));
    }

    if (timeRange === "today") {
      return periodWindow("today", "Today", startOfDay(now), endOfDay(now));
    }

    if (timeRange === "yesterday") {
      const day = shiftDays(now, -1);
      return periodWindow("yesterday", "Yesterday", startOfDay(day), endOfDay(day));
    }

    if (timeRange === "7d") {
      return periodWindow("7d", "Last 7 Days", startOfDay(shiftDays(now, -6)), endOfDay(now));
    }

    if (timeRange === "30d") {
      return periodWindow("30d", "Last 30 Days", startOfDay(shiftDays(now, -29)), endOfDay(now));
    }

    if (timeRange === "90d") {
      return periodWindow("90d", "Last 90 Days", startOfDay(shiftDays(now, -89)), endOfDay(now));
    }

    if (timeRange === "this_month") {
      return periodWindow("this_month", "This Month", startOfMonth(now), endOfMonth(now));
    }

    if (timeRange === "last_month") {
      const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      return periodWindow("last_month", "Last Month", startOfMonth(lastMonth), endOfMonth(lastMonth));
    }

    if (timeRange === "this_quarter") {
      return periodWindow("this_quarter", "This Quarter", startOfQuarter(now), endOfQuarter(now));
    }

    if (timeRange === "last_quarter") {
      const lastQuarterAnchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
      return periodWindow(
        "last_quarter",
        "Last Quarter",
        startOfQuarter(lastQuarterAnchor),
        endOfQuarter(lastQuarterAnchor),
      );
    }

    return periodWindow("this_year", "This Year", startOfYear(now), endOfYear(now));
  }

  resolveComparisonPeriod(currentPeriod: DashboardPeriodWindow): DashboardPeriodWindow {
    return previousWindow(currentPeriod);
  }
}

export const comparisonEngine = new ComparisonEngine();
