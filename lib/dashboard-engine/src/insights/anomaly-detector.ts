import type { DashboardSnapshot } from "../types.js";
import type {
  DashboardInsight,
  DashboardInsightCategory,
  DashboardInsightThresholds,
} from "./insight-types.js";
import { trendAnalyzer } from "./trend-analyzer.js";

function metricNumber(snapshot: DashboardSnapshot, key: string): number | null {
  const metric = snapshot.metrics.find((item) => item.key === key);
  if (typeof metric?.value === "number" && Number.isFinite(metric.value)) return metric.value;
  if (typeof metric?.value === "string") {
    const parsed = Number(metric.value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function createInsight(
  partial: Omit<DashboardInsight, "generatedAt" | "confidence" | "priority"> & {
    confidence?: number;
    priority?: number;
  },
  generatedAt: string,
): DashboardInsight {
  return {
    confidence: partial.confidence ?? 0.85,
    priority: partial.priority ?? 50,
    generatedAt,
    ...partial,
  };
}

export class AnomalyDetector {
  detect(snapshot: DashboardSnapshot, thresholds: DashboardInsightThresholds): DashboardInsight[] {
    const generatedAt = snapshot.refreshTimestamp ?? snapshot.capturedAt;
    const insights: DashboardInsight[] = [];
    const trends = snapshot.trends ?? snapshot.analytics?.kpis ?? {};

    for (const trend of trendAnalyzer.analyzeTrends(trends, thresholds)) {
      if (!trend.isSignificant) continue;

      const changeLabel =
        trend.changePercent == null ? "a significant shift" : `${Math.abs(trend.changePercent)}%`;

      if (trend.insightType === "negative_trend") {
        insights.push(
          createInsight(
            {
              id: `anomaly-drop-${trend.metricKey}`,
              title: `Decline detected in ${trend.metricKey}`,
              summary: `${trend.metricKey} declined by ${changeLabel} versus the comparison period.`,
              details: `What changed: ${trend.metricKey} moved ${trend.direction} with ${trend.strength} momentum. Why: performance dropped beyond the configured ${thresholds.kpiDropPercent}% threshold.`,
              category: trend.category,
              insightType: trend.metricKey.includes("revenue") ? "critical_alert" : "warning",
              severity: trend.metricKey.includes("revenue") ? "critical" : "high",
              affectedMetrics: [trend.metricKey],
              recommendedActions: [],
              priority: trend.metricKey.includes("revenue") ? 95 : 75,
            },
            generatedAt,
          ),
        );
      }

      if (trend.insightType === "positive_trend") {
        insights.push(
          createInsight(
            {
              id: `anomaly-growth-${trend.metricKey}`,
              title: `Growth detected in ${trend.metricKey}`,
              summary: `${trend.metricKey} increased by ${changeLabel} versus the comparison period.`,
              details: `What changed: ${trend.metricKey} is trending up with ${trend.strength} strength. Why: growth exceeded the configured ${thresholds.kpiGrowthPercent}% threshold.`,
              category: trend.category,
              insightType: "positive_trend",
              severity: "info",
              affectedMetrics: [trend.metricKey],
              recommendedActions: [],
              priority: 35,
            },
            generatedAt,
          ),
        );
      }
    }

    const openTickets = metricNumber(snapshot, "support.tickets.open") ?? 0;
    if (openTickets >= thresholds.ticketBacklogCount) {
      insights.push(
        createInsight(
          {
            id: "anomaly-ticket-backlog",
            title: "Support backlog requires attention",
            summary: `${openTickets} open tickets exceed the configured backlog threshold.`,
            details:
              "What changed: open ticket volume is elevated. Why: incoming support demand is outpacing closure rate.",
            category: "support",
            insightType: "critical_alert",
            severity: "critical",
            affectedMetrics: ["support.tickets.open"],
            recommendedActions: [],
            priority: 90,
          },
          generatedAt,
        ),
      );
    }

    const automationFailures = metricNumber(snapshot, "automation.failure") ?? 0;
    if (automationFailures >= thresholds.workflowFailureCount) {
      insights.push(
        createInsight(
          {
            id: "anomaly-automation-failures",
            title: "Automation failures spiked",
            summary: `${automationFailures} workflow failures were detected in the current snapshot.`,
            details:
              "What changed: automation reliability degraded. Why: failed executions exceeded the configured failure threshold.",
            category: "automation",
            insightType: "warning",
            severity: "high",
            affectedMetrics: ["automation.failure", "automation.runs"],
            recommendedActions: [],
            priority: 85,
          },
          generatedAt,
        ),
      );
    }

    const aiSuccessRate = metricNumber(snapshot, "ai.success_rate");
    if (aiSuccessRate != null && aiSuccessRate < thresholds.aiSuccessRateMin) {
      insights.push(
        createInsight(
          {
            id: "anomaly-ai-success",
            title: "AI success rate is below target",
            summary: `AI success rate is ${aiSuccessRate}%, below the ${thresholds.aiSuccessRateMin}% threshold.`,
            details:
              "What changed: AI execution quality declined. Why: success rate fell under the configured minimum.",
            category: "ai",
            insightType: "warning",
            severity: "high",
            affectedMetrics: ["ai.success_rate", "ai.conversations"],
            recommendedActions: [],
            priority: 80,
          },
          generatedAt,
        ),
      );
    }

    const slaCompliance = metricNumber(snapshot, "support.sla.compliance");
    if (slaCompliance != null && slaCompliance < thresholds.slaComplianceMin) {
      insights.push(
        createInsight(
          {
            id: "anomaly-sla-compliance",
            title: "SLA compliance dropped",
            summary: `SLA compliance is ${slaCompliance}%, below the ${thresholds.slaComplianceMin}% threshold.`,
            details:
              "What changed: support SLA performance weakened. Why: response or resolution targets are being missed.",
            category: "support",
            insightType: "warning",
            severity: "high",
            affectedMetrics: ["support.sla.compliance", "support.response.avg_minutes"],
            recommendedActions: [],
            priority: 82,
          },
          generatedAt,
        ),
      );
    }

    const failedDeliveries = metricNumber(snapshot, "channels.failed_deliveries") ?? 0;
    if (failedDeliveries >= thresholds.failedDeliveryCount) {
      insights.push(
        createInsight(
          {
            id: "anomaly-failed-deliveries",
            title: "Channel delivery failures increased",
            summary: `${failedDeliveries} failed deliveries were recorded.`,
            details:
              "What changed: outbound channel reliability declined. Why: failed delivery count exceeded threshold.",
            category: "channels",
            insightType: "warning",
            severity: "medium",
            affectedMetrics: ["channels.failed_deliveries"],
            recommendedActions: [],
            priority: 70,
          },
          generatedAt,
        ),
      );
    }

    const revenueTrend = trends["finance.revenue"];
    if (
      revenueTrend?.percentageDifference != null
      && revenueTrend.percentageDifference <= -thresholds.revenueDeclinePercent
    ) {
      insights.push(
        createInsight(
          {
            id: "anomaly-revenue-decline",
            title: "Revenue decline detected",
            summary: `Revenue declined ${Math.abs(revenueTrend.percentageDifference)}% versus the comparison period.`,
            details:
              "What changed: revenue trend turned negative. Why: collections or paid invoice volume dropped materially.",
            category: "revenue",
            insightType: "critical_alert",
            severity: "critical",
            affectedMetrics: ["finance.revenue"],
            recommendedActions: [],
            priority: 98,
          },
          generatedAt,
        ),
      );
    }

    const customerTrend = trends["crm.customers.total"];
    if (
      customerTrend?.percentageDifference != null
      && customerTrend.percentageDifference <= -thresholds.customerLossPercent
    ) {
      insights.push(
        createInsight(
          {
            id: "anomaly-customer-loss",
            title: "Customer base contraction detected",
            summary: `Total customers declined ${Math.abs(customerTrend.percentageDifference)}% versus the comparison period.`,
            details:
              "What changed: customer count trended down. Why: net customer loss exceeded the configured threshold.",
            category: "customers",
            insightType: "critical_alert",
            severity: "critical",
            affectedMetrics: ["crm.customers.total", "crm.customers.active"],
            recommendedActions: [],
            priority: 92,
          },
          generatedAt,
        ),
      );
    }

    return insights;
  }
}

export const anomalyDetector = new AnomalyDetector();
