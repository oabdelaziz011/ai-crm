import type { DashboardCollectInput, DashboardMetricProvider } from "@workspace/dashboard-engine";
import { buildDashboardMetric } from "@workspace/dashboard-engine";
import type { FinanceMetricsData } from "@/lib/dashboard/adapters/supabase-dashboard-metrics-ports";

export const FINANCE_METRICS_PROVIDER_ID = "finance";
export const FINANCE_VIEW_PERMISSION = "invoices.view";

export function createFinanceMetricsProvider(port: {
  fetchMetrics(companyId: string): Promise<FinanceMetricsData>;
}): DashboardMetricProvider {
  return {
    providerId: FINANCE_METRICS_PROVIDER_ID,
    category: "finance",
    requiredPermissions: [FINANCE_VIEW_PERMISSION],
    async collect(access, input: DashboardCollectInput) {
      if (access.companyId !== input.companyId) {
        throw new Error("Cross-company metric collection is forbidden.");
      }

      const capturedAt = new Date().toISOString();
      const data = await port.fetchMetrics(input.companyId);

      return {
        providerId: FINANCE_METRICS_PROVIDER_ID,
        category: "finance",
        companyId: input.companyId,
        capturedAt,
        metrics: [
          buildDashboardMetric(
            "finance.revenue",
            "finance",
            "Revenue",
            data.revenue,
            capturedAt,
            {
              unit: "currency",
              ...(data.revenueChangePercent != null
                ? { metadata: { changePercent: data.revenueChangePercent } }
                : {}),
            },
          ),
        ],
      };
    },
  };
}
