import type { DashboardMetricProvider } from "../types.js";
import { assertProviderTenant, buildDashboardMetric } from "./metric-builder.js";
import {
  AUTOMATION_METRICS_PROVIDER_ID,
  AUTOMATION_VIEW_PERMISSION,
  type AutomationMetricsPort,
} from "./ports/dashboard-metrics-ports.js";

export function createAutomationMetricsProvider(
  port: AutomationMetricsPort,
): DashboardMetricProvider {
  return {
    providerId: AUTOMATION_METRICS_PROVIDER_ID,
    category: "automation",
    requiredPermissions: [AUTOMATION_VIEW_PERMISSION],
    async collect(access, input) {
      const capturedAt = new Date().toISOString();
      assertProviderTenant(access.companyId, input.companyId);
      const data = await port.fetchMetrics(input.companyId);

      return {
        providerId: AUTOMATION_METRICS_PROVIDER_ID,
        category: "automation",
        companyId: input.companyId,
        capturedAt,
        metrics: [
          buildDashboardMetric(
            "automation.runs",
            "automation",
            "Workflow Runs",
            data.workflowRuns,
            capturedAt,
          ),
          buildDashboardMetric(
            "automation.success",
            "automation",
            "Success",
            data.successCount,
            capturedAt,
          ),
          buildDashboardMetric(
            "automation.failure",
            "automation",
            "Failure",
            data.failureCount,
            capturedAt,
          ),
          buildDashboardMetric(
            "automation.running",
            "automation",
            "Running Workflows",
            data.runningCount,
            capturedAt,
          ),
          buildDashboardMetric(
            "automation.runtime.avg_ms",
            "automation",
            "Average Runtime",
            data.averageRuntimeMs,
            capturedAt,
            { unit: "milliseconds" },
          ),
        ],
      };
    },
  };
}
