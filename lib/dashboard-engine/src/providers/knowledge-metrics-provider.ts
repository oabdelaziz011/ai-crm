import type { DashboardMetricProvider } from "../types.js";
import { assertProviderTenant, buildDashboardMetric } from "./metric-builder.js";
import {
  KNOWLEDGE_METRICS_PROVIDER_ID,
  KNOWLEDGE_VIEW_PERMISSION,
  type KnowledgeMetricsPort,
} from "./ports/dashboard-metrics-ports.js";

export function createKnowledgeMetricsProvider(port: KnowledgeMetricsPort): DashboardMetricProvider {
  return {
    providerId: KNOWLEDGE_METRICS_PROVIDER_ID,
    category: "knowledge",
    requiredPermissions: [KNOWLEDGE_VIEW_PERMISSION],
    async collect(access, input) {
      const capturedAt = new Date().toISOString();
      assertProviderTenant(access.companyId, input.companyId);
      const data = await port.fetchMetrics(input.companyId);

      return {
        providerId: KNOWLEDGE_METRICS_PROVIDER_ID,
        category: "knowledge",
        companyId: input.companyId,
        capturedAt,
        metrics: [
          buildDashboardMetric(
            "knowledge.searches",
            "knowledge",
            "Knowledge Searches",
            data.searches,
            capturedAt,
          ),
          buildDashboardMetric(
            "knowledge.retrieval.success_rate",
            "knowledge",
            "Retrieval Success Rate",
            data.retrievalSuccessRatePercent,
            capturedAt,
            { unit: "percent" },
          ),
          buildDashboardMetric(
            "knowledge.documents.retrieved",
            "knowledge",
            "Retrieved Documents",
            data.retrievedDocuments,
            capturedAt,
          ),
          buildDashboardMetric(
            "knowledge.retrieval.avg_ms",
            "knowledge",
            "Average Retrieval Time",
            data.averageRetrievalTimeMs,
            capturedAt,
            { unit: "milliseconds" },
          ),
        ],
      };
    },
  };
}
