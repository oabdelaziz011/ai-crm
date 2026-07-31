import type { DashboardMetric, DashboardSnapshot } from "../types.js";
import type {
  DashboardAnalyticsBundle,
  DashboardChartPoint,
  DashboardChartSeries,
  DashboardHistoricalBucket,
  DashboardKpiAnalytics,
} from "./analytics-types.js";
import { comparisonEngine } from "./comparison-engine.js";
import { trendCalculator } from "./trend-calculator.js";
import {
  buildChartSeriesFromHistorical,
  chartMetricKeys,
  DASHBOARD_CHART_SERIES_DEFINITIONS,
} from "./chart-series-registry.js";
import { timeSeriesBuilder } from "./time-series-builder.js";
import type { DashboardAnalyticsEnrichmentInput } from "./analytics-types.js";

function metricNumericValue(metric: DashboardMetric): number | null {
  if (typeof metric.value === "number" && Number.isFinite(metric.value)) return metric.value;
  if (typeof metric.value === "string") {
    const parsed = Number(metric.value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function sumBuckets(buckets: DashboardHistoricalBucket[], metricKey: string): number {
  return buckets
    .filter((bucket) => bucket.metricKey === metricKey)
    .reduce((total, bucket) => total + bucket.value, 0);
}

export class AnalyticsAggregator {
  buildKpiAnalytics(
    snapshot: DashboardSnapshot,
    currentBuckets: DashboardHistoricalBucket[],
    previousBuckets: DashboardHistoricalBucket[],
    input: DashboardAnalyticsEnrichmentInput,
  ): Record<string, DashboardKpiAnalytics> {
    const currentPeriod = comparisonEngine.resolveCurrentPeriod(input.timeRange, input.customRange);
    const comparisonPeriod = comparisonEngine.resolveComparisonPeriod(currentPeriod);
    const analytics: Record<string, DashboardKpiAnalytics> = {};

    for (const metric of snapshot.metrics) {
      const currentValue = metricNumericValue(metric);
      if (currentValue == null) continue;

      const previousValue = sumBuckets(previousBuckets, metric.key);
      const trend = trendCalculator.summarize(currentValue, previousValue);

      analytics[metric.key] = {
        metricKey: metric.key,
        category: metric.category,
        currentValue,
        previousValue,
        absoluteDifference: trend.absoluteDifference,
        percentageDifference: trend.percentageDifference,
        trendDirection: trend.trendDirection,
        trendStrength: trend.trendStrength,
        comparisonPeriod,
      };
    }

    for (const metricKey of chartMetricKeys()) {
      if (analytics[metricKey]) continue;
      const currentValue = sumBuckets(currentBuckets, metricKey);
      const previousValue = sumBuckets(previousBuckets, metricKey);
      const metric = snapshot.metrics.find((item) => item.key === metricKey);
      const trend = trendCalculator.summarize(currentValue, previousValue);

      analytics[metricKey] = {
        metricKey,
        category: metric?.category ?? "system",
        currentValue,
        previousValue,
        absoluteDifference: trend.absoluteDifference,
        percentageDifference: trend.percentageDifference,
        trendDirection: trend.trendDirection,
        trendStrength: trend.trendStrength,
        comparisonPeriod,
      };
    }

    return analytics;
  }

  buildAnalyticsBundle(
    snapshot: DashboardSnapshot,
    kpis: Record<string, DashboardKpiAnalytics>,
    input: DashboardAnalyticsEnrichmentInput,
  ): DashboardAnalyticsBundle {
    const currentPeriod = comparisonEngine.resolveCurrentPeriod(input.timeRange, input.customRange);
    const comparisonPeriod = comparisonEngine.resolveComparisonPeriod(currentPeriod);

    return {
      timeRange: input.timeRange,
      currentPeriod,
      comparisonPeriod,
      kpis,
      generatedAt: new Date().toISOString(),
    };
  }

  buildChartSeries(
    buckets: DashboardHistoricalBucket[],
    timeRange: DashboardAnalyticsEnrichmentInput["timeRange"],
  ): {
    chartSeries: DashboardChartSeries[];
    historicalValues: Record<string, DashboardChartPoint[]>;
  } {
    const metricKeys = chartMetricKeys();
    const historicalValues = timeSeriesBuilder.buildHistoricalMap(metricKeys, buckets, timeRange);
    const chartSeries = buildChartSeriesFromHistorical(
      DASHBOARD_CHART_SERIES_DEFINITIONS,
      historicalValues,
    );

    return { chartSeries, historicalValues };
  }
}

export const analyticsAggregator = new AnalyticsAggregator();
