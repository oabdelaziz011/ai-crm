import type { DashboardMetricCategory, DashboardMetricTrend } from "../types.js";

export const DASHBOARD_TIME_RANGE_KEYS = [
  "today",
  "yesterday",
  "7d",
  "30d",
  "90d",
  "this_month",
  "last_month",
  "this_quarter",
  "last_quarter",
  "this_year",
  "custom",
] as const;

export type DashboardTimeRangeKey = (typeof DASHBOARD_TIME_RANGE_KEYS)[number];

export type DashboardCustomRange = {
  startAt: string;
  endAt: string;
};

export type DashboardPeriodWindow = {
  key: DashboardTimeRangeKey;
  label: string;
  startAt: string;
  endAt: string;
};

export type DashboardTrendStrength = "strong" | "moderate" | "weak" | "none";

export type DashboardKpiAnalytics = {
  metricKey: string;
  category: DashboardMetricCategory;
  currentValue: number;
  previousValue: number;
  absoluteDifference: number;
  percentageDifference: number | null;
  trendDirection: DashboardMetricTrend;
  trendStrength: DashboardTrendStrength;
  comparisonPeriod: DashboardPeriodWindow;
};

export type DashboardChartPoint = {
  label: string;
  value: number;
  timestamp?: string;
};

export type DashboardChartSeries = {
  id: string;
  metricKey: string;
  category: DashboardMetricCategory;
  label: string;
  points: DashboardChartPoint[];
};

export type DashboardHistoricalBucket = {
  metricKey: string;
  periodStart: string;
  periodEnd: string;
  value: number;
};

export type DashboardAnalyticsBundle = {
  timeRange: DashboardTimeRangeKey;
  currentPeriod: DashboardPeriodWindow;
  comparisonPeriod: DashboardPeriodWindow;
  kpis: Record<string, DashboardKpiAnalytics>;
  generatedAt: string;
};

export type DashboardAnalyticsEnrichmentInput = {
  companyId: string;
  timeRange: DashboardTimeRangeKey;
  customRange?: DashboardCustomRange;
};
