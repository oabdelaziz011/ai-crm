import type { DashboardSnapshot } from "../types.js";
import type { DashboardAnalyticsEnrichmentInput } from "./analytics-types.js";
import { analyticsAggregator } from "./analytics-aggregator.js";
import { chartMetricKeys } from "./chart-series-registry.js";
import { comparisonEngine } from "./comparison-engine.js";
import type { DashboardHistoricalDataPort } from "./ports/dashboard-historical-data-port.js";

export type DashboardAnalyticsEngineOptions = {
  historicalPort: DashboardHistoricalDataPort;
};

export class DashboardAnalyticsEngine {
  private readonly historicalPort: DashboardHistoricalDataPort;

  constructor(options: DashboardAnalyticsEngineOptions) {
    this.historicalPort = options.historicalPort;
  }

  async enrich(
    snapshot: DashboardSnapshot,
    input: DashboardAnalyticsEnrichmentInput,
  ): Promise<DashboardSnapshot> {
    if (snapshot.companyId !== input.companyId) {
      throw new Error("Cross-company analytics enrichment is forbidden.");
    }

    const currentPeriod = comparisonEngine.resolveCurrentPeriod(input.timeRange, input.customRange);
    const comparisonPeriod = comparisonEngine.resolveComparisonPeriod(currentPeriod);
    const metricKeys = [
      ...new Set([...snapshot.metrics.map((metric) => metric.key), ...chartMetricKeys()]),
    ];

    const [currentBuckets, previousBuckets, seriesBuckets] = await Promise.all([
      this.historicalPort.fetchPeriodBuckets({
        ...input,
        metricKeys,
        periodStart: currentPeriod.startAt,
        periodEnd: currentPeriod.endAt,
      }),
      this.historicalPort.fetchPeriodBuckets({
        ...input,
        metricKeys,
        periodStart: comparisonPeriod.startAt,
        periodEnd: comparisonPeriod.endAt,
      }),
      this.historicalPort.fetchPeriodBuckets({
        ...input,
        metricKeys,
        periodStart: currentPeriod.startAt,
        periodEnd: currentPeriod.endAt,
      }),
    ]);

    const kpis = analyticsAggregator.buildKpiAnalytics(
      snapshot,
      currentBuckets,
      previousBuckets,
      input,
    );
    const analytics = analyticsAggregator.buildAnalyticsBundle(snapshot, kpis, input);
    const { chartSeries, historicalValues } = analyticsAggregator.buildChartSeries(
      seriesBuckets,
      input.timeRange,
    );

    const refreshTimestamp = new Date().toISOString();

    return {
      ...snapshot,
      analytics,
      chartSeries,
      trends: kpis,
      comparisons: kpis,
      historicalValues,
      refreshTimestamp,
      metrics: snapshot.metrics.map((metric) => {
        const kpi = kpis[metric.key];
        if (!kpi) return metric;
        return {
          ...metric,
          trend: kpi.trendDirection,
          metadata: {
            ...metric.metadata,
            currentValue: kpi.currentValue,
            previousValue: kpi.previousValue,
            absoluteDifference: kpi.absoluteDifference,
            percentageDifference: kpi.percentageDifference,
            trendStrength: kpi.trendStrength,
            comparisonPeriodKey: kpi.comparisonPeriod.key,
          },
        };
      }),
    };
  }
}

export const createDashboardAnalyticsEngine = (historicalPort: DashboardHistoricalDataPort) =>
  new DashboardAnalyticsEngine({ historicalPort });
