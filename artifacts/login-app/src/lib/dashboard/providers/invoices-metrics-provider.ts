import type { DashboardCollectInput, DashboardMetricProvider } from "@workspace/dashboard-engine";
import { buildDashboardMetric } from "@workspace/dashboard-engine";
import type { InvoicesMetricsData } from "@/lib/dashboard/adapters/supabase-dashboard-metrics-ports";

export const INVOICES_METRICS_PROVIDER_ID = "invoices";
export const INVOICES_VIEW_PERMISSION = "invoices.view";

export function createInvoicesMetricsProvider(port: {
  fetchMetrics(companyId: string): Promise<InvoicesMetricsData>;
}): DashboardMetricProvider {
  return {
    providerId: INVOICES_METRICS_PROVIDER_ID,
    category: "finance",
    requiredPermissions: [INVOICES_VIEW_PERMISSION],
    async collect(access, input: DashboardCollectInput) {
      if (access.companyId !== input.companyId) {
        throw new Error("Cross-company metric collection is forbidden.");
      }

      const capturedAt = new Date().toISOString();
      const data = await port.fetchMetrics(input.companyId);

      return {
        providerId: INVOICES_METRICS_PROVIDER_ID,
        category: "finance",
        companyId: input.companyId,
        capturedAt,
        metrics: [
          buildDashboardMetric(
            "invoices.outstanding",
            "finance",
            "Outstanding Invoices",
            data.invoices,
            capturedAt,
            data.invoicesChangePercent != null
              ? { metadata: { changePercent: data.invoicesChangePercent } }
              : undefined,
          ),
        ],
      };
    },
  };
}
