import type { DashboardChartPoint, DashboardHistoricalBucket, DashboardTimeRangeKey } from "./analytics-types.js";
import { analyticsFormatter, bucketsToChartPoints } from "./analytics-formatter.js";

function granularityForRange(timeRange: DashboardTimeRangeKey): "day" | "week" | "month" {
  if (timeRange === "this_year") return "month";
  if (timeRange === "this_quarter" || timeRange === "last_quarter" || timeRange === "90d") return "week";
  return "day";
}

function aggregateBuckets(
  buckets: DashboardHistoricalBucket[],
  maxPoints: number,
): DashboardHistoricalBucket[] {
  if (buckets.length <= maxPoints) return buckets;

  const chunkSize = Math.ceil(buckets.length / maxPoints);
  const sorted = analyticsFormatter.sortBuckets(buckets);
  const aggregated: DashboardHistoricalBucket[] = [];

  for (let index = 0; index < sorted.length; index += chunkSize) {
    const chunk = sorted.slice(index, index + chunkSize);
    aggregated.push({
      metricKey: chunk[0]?.metricKey ?? "unknown",
      periodStart: chunk[0]?.periodStart ?? new Date().toISOString(),
      periodEnd: chunk.at(-1)?.periodEnd ?? new Date().toISOString(),
      value: chunk.reduce((sum, bucket) => sum + bucket.value, 0),
    });
  }

  return aggregated;
}

export class TimeSeriesBuilder {
  buildMetricSeries(
    metricKey: string,
    buckets: DashboardHistoricalBucket[],
    timeRange: DashboardTimeRangeKey,
    maxPoints = 24,
  ): DashboardChartPoint[] {
    const metricBuckets = buckets.filter((bucket) => bucket.metricKey === metricKey);
    const aggregated = aggregateBuckets(metricBuckets, maxPoints);
    return bucketsToChartPoints(aggregated, analyticsFormatter, granularityForRange(timeRange));
  }

  buildHistoricalMap(
    metricKeys: string[],
    buckets: DashboardHistoricalBucket[],
    timeRange: DashboardTimeRangeKey,
  ): Record<string, DashboardChartPoint[]> {
    const historicalValues: Record<string, DashboardChartPoint[]> = {};
    for (const metricKey of metricKeys) {
      historicalValues[metricKey] = this.buildMetricSeries(metricKey, buckets, timeRange);
    }
    return historicalValues;
  }
}

export const timeSeriesBuilder = new TimeSeriesBuilder();
