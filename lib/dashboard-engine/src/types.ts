export const DASHBOARD_METRIC_CATEGORIES = [
  "crm",
  "sales",
  "support",
  "marketing",
  "finance",
  "ai",
  "automation",
  "channels",
  "knowledge",
  "system",
] as const;

export type DashboardMetricCategory = (typeof DASHBOARD_METRIC_CATEGORIES)[number] | string;

export type DashboardMetricValue = number | string | boolean | null;

export type DashboardMetricTrend = "up" | "down" | "flat" | "unknown";

export type DashboardMetric = {
  key: string;
  category: DashboardMetricCategory;
  label: string;
  value: DashboardMetricValue;
  unit?: string | null;
  trend?: DashboardMetricTrend;
  description?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
  capturedAt: string;
};

export type DashboardProviderSnapshot = {
  providerId: string;
  category: DashboardMetricCategory;
  companyId: string;
  capturedAt: string;
  metrics: DashboardMetric[];
  warnings?: string[];
};

export type {
  DashboardAnalyticsBundle,
  DashboardChartPoint,
  DashboardChartSeries,
  DashboardCustomRange,
  DashboardHistoricalBucket,
  DashboardKpiAnalytics,
  DashboardPeriodWindow,
  DashboardTimeRangeKey,
  DashboardTrendStrength,
} from "./analytics/analytics-types.js";

export { DASHBOARD_TIME_RANGE_KEYS } from "./analytics/analytics-types.js";

import type {
  DashboardAnalyticsBundle,
  DashboardChartPoint,
  DashboardChartSeries,
  DashboardKpiAnalytics,
} from "./analytics/analytics-types.js";
import type { DashboardExecutiveInsightBundle } from "./insights/insight-types.js";

export type { DashboardExecutiveInsightBundle } from "./insights/insight-types.js";
export type {
  DashboardInsight,
  DashboardInsightCategory,
  DashboardInsightType,
  DashboardInsightSeverity,
  DashboardBusinessHealth,
  DashboardRecommendedAction,
  DashboardRecommendedActionType,
  DashboardExecutiveSummary,
  DashboardInsightThresholds,
} from "./insights/insight-types.js";

export type DashboardSnapshot = {
  companyId: string;
  capturedAt: string;
  metrics: DashboardMetric[];
  providers: DashboardProviderResult[];
  warnings: string[];
  analytics?: DashboardAnalyticsBundle;
  chartSeries?: DashboardChartSeries[];
  trends?: Record<string, DashboardKpiAnalytics>;
  comparisons?: Record<string, DashboardKpiAnalytics>;
  historicalValues?: Record<string, DashboardChartPoint[]>;
  refreshTimestamp?: string;
  executiveInsights?: DashboardExecutiveInsightBundle;
};

export type DashboardProviderResult = {
  providerId: string;
  category: DashboardMetricCategory;
  status: "success" | "failed" | "skipped";
  metricCount: number;
  error?: string;
  warnings?: string[];
};

export type DashboardAccess = {
  userId: string;
  companyId: string;
  isSuperAdmin: boolean;
  hasPermission: (permission: string) => boolean;
};

export type DashboardQueryFilter = {
  categories?: DashboardMetricCategory[];
  providerIds?: string[];
  metricKeys?: string[];
};

export type DashboardQuery = {
  companyId: string;
  filter?: DashboardQueryFilter;
  scope?: Record<string, string | number | boolean | null>;
};

export type DashboardCollectInput = {
  companyId: string;
  filter?: DashboardQueryFilter;
  scope?: Record<string, string | number | boolean | null>;
};

export type DashboardMetricProvider = {
  readonly providerId: string;
  readonly category: DashboardMetricCategory;
  readonly requiredPermissions?: string[];
  collect(access: DashboardAccess, input: DashboardCollectInput): Promise<DashboardProviderSnapshot>;
};

/** Reserved for a future caching sprint — not implemented in 6.6.1. */
export type DashboardCachePort = {
  get(key: string): Promise<DashboardSnapshot | null>;
  set(key: string, snapshot: DashboardSnapshot, ttlMs?: number): Promise<void>;
};

/** Reserved for a future realtime sprint — not implemented in 6.6.1. */
export type DashboardRefreshPort = {
  subscribe(
    companyId: string,
    listener: (snapshot: DashboardSnapshot) => void,
  ): Promise<() => void>;
};
