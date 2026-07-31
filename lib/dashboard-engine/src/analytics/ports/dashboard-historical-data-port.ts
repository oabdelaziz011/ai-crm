import type { DashboardAnalyticsEnrichmentInput, DashboardHistoricalBucket } from "../analytics-types.js";

export type DashboardHistoricalDataRequest = DashboardAnalyticsEnrichmentInput & {
  metricKeys: string[];
  periodStart: string;
  periodEnd: string;
};

export type DashboardHistoricalDataPort = {
  fetchPeriodBuckets(request: DashboardHistoricalDataRequest): Promise<DashboardHistoricalBucket[]>;
};
