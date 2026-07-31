import type { DashboardMetricProvider } from "../types.js";
import { assertProviderTenant, buildDashboardMetric } from "./metric-builder.js";
import {
  AI_METRICS_PROVIDER_ID,
  AI_VIEW_PERMISSION,
  type AiMetricsPort,
} from "./ports/dashboard-metrics-ports.js";

export function createAiMetricsProvider(port: AiMetricsPort): DashboardMetricProvider {
  return {
    providerId: AI_METRICS_PROVIDER_ID,
    category: "ai",
    requiredPermissions: [AI_VIEW_PERMISSION],
    async collect(access, input) {
      const capturedAt = new Date().toISOString();
      assertProviderTenant(access.companyId, input.companyId);
      const data = await port.fetchMetrics(input.companyId);

      return {
        providerId: AI_METRICS_PROVIDER_ID,
        category: "ai",
        companyId: input.companyId,
        capturedAt,
        metrics: [
          buildDashboardMetric(
            "ai.conversations",
            "ai",
            "AI Conversations",
            data.conversations,
            capturedAt,
          ),
          buildDashboardMetric(
            "ai.success_rate",
            "ai",
            "AI Success Rate",
            data.successRatePercent,
            capturedAt,
            { unit: "percent" },
          ),
          buildDashboardMetric(
            "ai.tool_calls",
            "ai",
            "AI Tool Calls",
            data.toolCalls,
            capturedAt,
          ),
          buildDashboardMetric(
            "ai.escalations",
            "ai",
            "AI Escalations",
            data.escalations,
            capturedAt,
          ),
          buildDashboardMetric(
            "ai.hours_saved",
            "ai",
            "Estimated Hours Saved",
            data.estimatedHoursSaved,
            capturedAt,
            { unit: "hours" },
          ),
        ],
      };
    },
  };
}
