import type { DashboardMetricProvider } from "../types.js";
import { assertProviderTenant, buildDashboardMetric } from "./metric-builder.js";
import {
  CRM_METRICS_PROVIDER_ID,
  CRM_VIEW_PERMISSION,
  type CrmMetricsPort,
} from "./ports/dashboard-metrics-ports.js";

export function createCrmMetricsProvider(port: CrmMetricsPort): DashboardMetricProvider {
  return {
    providerId: CRM_METRICS_PROVIDER_ID,
    category: "crm",
    requiredPermissions: [CRM_VIEW_PERMISSION],
    async collect(access, input) {
      const capturedAt = new Date().toISOString();
      assertProviderTenant(access.companyId, input.companyId);
      const data = await port.fetchMetrics(input.companyId);

      return {
        providerId: CRM_METRICS_PROVIDER_ID,
        category: "crm",
        companyId: input.companyId,
        capturedAt,
        metrics: [
          buildDashboardMetric(
            "crm.customers.total",
            "crm",
            "Total Customers",
            data.totalCustomers,
            capturedAt,
          ),
          buildDashboardMetric(
            "crm.customers.active",
            "crm",
            "Active Customers",
            data.activeCustomers,
            capturedAt,
          ),
          buildDashboardMetric(
            "crm.customers.new",
            "crm",
            "New Customers",
            data.newCustomers,
            capturedAt,
          ),
          buildDashboardMetric("crm.leads", "crm", "Leads", data.leads, capturedAt),
          buildDashboardMetric("crm.deals", "crm", "Deals", data.deals, capturedAt),
          buildDashboardMetric(
            "crm.pipeline.value",
            "crm",
            "Pipeline Value",
            data.pipelineValue,
            capturedAt,
            { unit: "currency" },
          ),
        ],
      };
    },
  };
}
