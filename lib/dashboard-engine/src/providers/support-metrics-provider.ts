import type { DashboardMetricProvider } from "../types.js";
import { assertProviderTenant, buildDashboardMetric } from "./metric-builder.js";
import {
  SUPPORT_METRICS_PROVIDER_ID,
  SUPPORT_VIEW_PERMISSION,
  type SupportMetricsPort,
} from "./ports/dashboard-metrics-ports.js";

export function createSupportMetricsProvider(port: SupportMetricsPort): DashboardMetricProvider {
  return {
    providerId: SUPPORT_METRICS_PROVIDER_ID,
    category: "support",
    requiredPermissions: [SUPPORT_VIEW_PERMISSION],
    async collect(access, input) {
      const capturedAt = new Date().toISOString();
      assertProviderTenant(access.companyId, input.companyId);
      const data = await port.fetchMetrics(input.companyId);

      return {
        providerId: SUPPORT_METRICS_PROVIDER_ID,
        category: "support",
        companyId: input.companyId,
        capturedAt,
        metrics: [
          buildDashboardMetric(
            "support.tickets.open",
            "support",
            "Open Tickets",
            data.openTickets,
            capturedAt,
          ),
          buildDashboardMetric(
            "support.tickets.closed_today",
            "support",
            "Closed Today",
            data.closedToday,
            capturedAt,
          ),
          buildDashboardMetric(
            "support.sla.compliance",
            "support",
            "SLA Compliance",
            data.slaCompliancePercent,
            capturedAt,
            { unit: "percent" },
          ),
          buildDashboardMetric(
            "support.response.avg_minutes",
            "support",
            "Average Response",
            data.averageResponseMinutes,
            capturedAt,
            { unit: "minutes" },
          ),
          buildDashboardMetric(
            "support.resolution.avg_minutes",
            "support",
            "Average Resolution",
            data.averageResolutionMinutes,
            capturedAt,
            { unit: "minutes" },
          ),
        ],
      };
    },
  };
}
