import type { DashboardChartPoint, DashboardHistoricalBucket } from "./analytics-types.js";

export class AnalyticsFormatter {
  formatBucketLabel(timestamp: string, granularity: "day" | "week" | "month"): string {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return timestamp;

    if (granularity === "month") {
      return date.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
    }

    if (granularity === "week") {
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    }

    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  }

  formatMetricValue(value: number, unit?: string | null): string {
    if (unit === "currency") {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(value);
    }
    if (unit === "percent") return `${value}%`;
    return String(value);
  }

  sortBuckets(buckets: DashboardHistoricalBucket[]): DashboardHistoricalBucket[] {
    return [...buckets].sort(
      (left, right) => new Date(left.periodStart).getTime() - new Date(right.periodStart).getTime(),
    );
  }
}

export const analyticsFormatter = new AnalyticsFormatter();

export function bucketsToChartPoints(
  buckets: DashboardHistoricalBucket[],
  formatter: AnalyticsFormatter,
  granularity: "day" | "week" | "month",
): DashboardChartPoint[] {
  return formatter.sortBuckets(buckets).map((bucket) => ({
    label: formatter.formatBucketLabel(bucket.periodStart, granularity),
    value: bucket.value,
    timestamp: bucket.periodStart,
  }));
}
