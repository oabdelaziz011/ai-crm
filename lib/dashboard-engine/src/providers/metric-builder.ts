import type {
  DashboardMetric,
  DashboardMetricCategory,
  DashboardMetricTrend,
  DashboardMetricValue,
} from "../types.js";

export function buildDashboardMetric(
  key: string,
  category: DashboardMetricCategory,
  label: string,
  value: DashboardMetricValue,
  capturedAt: string,
  options?: {
    unit?: string | null;
    description?: string | null;
    trend?: DashboardMetricTrend;
    metadata?: Record<string, string | number | boolean | null>;
  },
): DashboardMetric {
  return {
    key,
    category,
    label,
    value,
    unit: options?.unit ?? null,
    description: options?.description ?? null,
    trend: options?.trend,
    metadata: options?.metadata,
    capturedAt,
  };
}

export function assertProviderTenant(accessCompanyId: string, queryCompanyId: string): void {
  if (accessCompanyId !== queryCompanyId) {
    throw new Error("Cross-company metric collection is forbidden.");
  }
}
