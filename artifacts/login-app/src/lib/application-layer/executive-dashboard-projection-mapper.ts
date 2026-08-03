import type { DashboardSnapshot, DashboardMetric, DashboardKpiAnalytics } from "@workspace/dashboard-engine";
import type { DashboardProjectionDto, ExecutiveInsightsProjectionDto } from "@workspace/application-layer";

function metricFromKpi(
  kpi: { id: string; label: string; value: string; trend?: string },
  category: string,
  capturedAt: string,
  unit?: string,
): DashboardMetric {
  const numeric = Number(String(kpi.value).replace(/[^0-9.-]/g, ""));
  return {
    key: kpi.id,
    category,
    label: kpi.label,
    value: Number.isFinite(numeric) ? numeric : kpi.value,
    unit: unit ?? (kpi.id.includes("revenue") || kpi.id.includes("outstanding") ? "currency" : kpi.id.includes("rate") || kpi.id.includes("utilization") ? "percent" : "count"),
    trend: kpi.trend?.startsWith("+") ? "up" : kpi.trend?.startsWith("-") ? "down" : "flat",
    capturedAt,
  };
}

function parseTrendPercent(trend?: string): number | null {
  if (!trend) return null;
  const match = trend.match(/-?\d+/);
  return match ? Number(match[0]) : null;
}

/** Maps application-layer dashboard + insights projections → dashboard-engine snapshot (UI contract unchanged). */
export function mapExecutiveProjectionToDashboardSnapshot(input: {
  companyId: string;
  dashboard: DashboardProjectionDto;
  insights?: ExecutiveInsightsProjectionDto;
  telemetryMs?: number;
}): DashboardSnapshot {
  const capturedAt = new Date().toISOString();
  const metrics: DashboardMetric[] = input.dashboard.kpis.map((kpi) =>
    metricFromKpi(kpi, kpi.id.split(".")[0] ?? "system", capturedAt),
  );

  const trends: Record<string, DashboardKpiAnalytics> = {};
  for (const kpi of input.dashboard.kpis) {
    trends[kpi.id] = {
      trendDirection: kpi.trend?.startsWith("+") ? "up" : kpi.trend?.startsWith("-") ? "down" : "flat",
      percentageDifference: parseTrendPercent(kpi.trend),
      comparisonLabel: "vs previous period",
      strength: "moderate",
    };
  }

  const historicalValues: DashboardSnapshot["historicalValues"] = {};
  for (const [key, points] of Object.entries(input.dashboard.charts)) {
    historicalValues[key] = points.map((point) => ({ label: point.label, value: point.value }));
  }

  const executiveInsights = input.insights
    ? {
        insights: input.insights.insights.map((insight, index) => ({
          id: insight.id,
          title: insight.title,
          summary: insight.summary,
          details: insight.details,
          category: (insight.category as "revenue") ?? "revenue",
          severity: insight.severity,
          insightType: insight.severity === "info" ? ("information" as const) : ("warning" as const),
          confidence: insight.confidence,
          affectedMetrics: [],
          recommendedActions: insight.suggestedAction
            ? [{
                id: `${insight.id}_action`,
                actionType: "review_unpaid_invoices" as const,
                label: insight.suggestedAction,
                description: insight.reason,
                category: (insight.category as "revenue") ?? "revenue",
                priority: index + 1,
                relatedMetrics: [],
              }]
            : [],
          priority: index + 1,
          generatedAt: capturedAt,
        })),
        summary: {
          overallBusinessHealth: input.insights.summary.health,
          topWins: [...input.insights.summary.topWins],
          topRisks: [...input.insights.summary.topRisks],
          immediateActions: [],
          longTermOpportunities: [],
          generatedAt: capturedAt,
        },
        generatedAt: capturedAt,
      }
    : undefined;

  return {
    companyId: input.companyId,
    capturedAt,
    metrics,
    providers: [
      {
        providerId: "executive-analytics",
        category: "finance",
        status: "success",
        metricCount: metrics.length,
      },
    ],
    warnings: input.telemetryMs != null && input.telemetryMs > 2000 ? [`Dashboard aggregation took ${input.telemetryMs}ms`] : [],
    historicalValues,
    trends,
    executiveInsights,
    refreshTimestamp: capturedAt,
  };
}
