import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DashboardInsightEngine,
  DEFAULT_INSIGHT_THRESHOLDS,
  anomalyDetector,
  trendAnalyzer,
  recommendationEngine,
  insightPrioritizer,
  executiveSummaryBuilder,
  resetRecommendationEngineCounter,
  type DashboardSnapshot,
  type DashboardKpiAnalytics,
} from "../index.js";

function metric(
  key: string,
  value: number,
  category = "system",
): DashboardSnapshot["metrics"][number] {
  return {
    key,
    category,
    label: key,
    value,
    capturedAt: "2026-07-31T10:00:00.000Z",
  };
}

function trend(
  metricKey: string,
  currentValue: number,
  previousValue: number,
  category = "crm",
): DashboardKpiAnalytics {
  const absoluteDifference = currentValue - previousValue;
  const percentageDifference =
    previousValue === 0 ? null : (absoluteDifference / previousValue) * 100;

  return {
    metricKey,
    category,
    currentValue,
    previousValue,
    absoluteDifference,
    percentageDifference,
    trendDirection: absoluteDifference > 0 ? "up" : absoluteDifference < 0 ? "down" : "flat",
    trendStrength: "strong",
    comparisonPeriod: {
      key: "30d",
      label: "Previous 30 days",
      startAt: "2026-06-01T00:00:00.000Z",
      endAt: "2026-06-30T23:59:59.999Z",
    },
  };
}

function baseSnapshot(overrides: Partial<DashboardSnapshot> = {}): DashboardSnapshot {
  return {
    companyId: "company-1",
    capturedAt: "2026-07-31T10:00:00.000Z",
    metrics: [],
    providers: [],
    warnings: [],
    ...overrides,
  };
}

describe("TrendAnalyzer", () => {
  it("classifies significant positive and negative trends", () => {
    const results = trendAnalyzer.analyzeTrends(
      {
        "finance.revenue": trend("finance.revenue", 80, 100, "finance"),
        "crm.customers.new": trend("crm.customers.new", 130, 100, "crm"),
      },
      DEFAULT_INSIGHT_THRESHOLDS,
    );

    const revenue = results.find((item) => item.metricKey === "finance.revenue");
    const customers = results.find((item) => item.metricKey === "crm.customers.new");

    assert.equal(revenue?.insightType, "negative_trend");
    assert.equal(revenue?.isSignificant, true);
    assert.equal(customers?.insightType, "positive_trend");
    assert.equal(customers?.isSignificant, true);
  });
});

describe("AnomalyDetector", () => {
  it("detects backlog, automation failures, and revenue decline", () => {
    const snapshot = baseSnapshot({
      metrics: [
        metric("support.tickets.open", 15, "support"),
        metric("automation.failure", 8, "automation"),
        metric("ai.success_rate", 55, "ai"),
      ],
      trends: {
        "finance.revenue": trend("finance.revenue", 70, 100, "finance"),
        "crm.customers.total": trend("crm.customers.total", 85, 100, "crm"),
      },
    });

    const insights = anomalyDetector.detect(snapshot, DEFAULT_INSIGHT_THRESHOLDS);
    const ids = insights.map((item) => item.id);

    assert.ok(ids.includes("anomaly-ticket-backlog"));
    assert.ok(ids.includes("anomaly-automation-failures"));
    assert.ok(ids.includes("anomaly-ai-success"));
    assert.ok(ids.includes("anomaly-revenue-decline"));
    assert.ok(ids.includes("anomaly-customer-loss"));
  });

  it("respects custom thresholds", () => {
    const snapshot = baseSnapshot({
      metrics: [metric("support.tickets.open", 8, "support")],
    });

    const strict = anomalyDetector.detect(snapshot, {
      ...DEFAULT_INSIGHT_THRESHOLDS,
      ticketBacklogCount: 20,
    });
    assert.equal(strict.some((item) => item.id === "anomaly-ticket-backlog"), false);

    const relaxed = anomalyDetector.detect(snapshot, {
      ...DEFAULT_INSIGHT_THRESHOLDS,
      ticketBacklogCount: 5,
    });
    assert.equal(relaxed.some((item) => item.id === "anomaly-ticket-backlog"), true);
  });
});

describe("RecommendationEngine", () => {
  it("generates structured actions for support and automation insights", () => {
    resetRecommendationEngineCounter();
    const insights = anomalyDetector.detect(
      baseSnapshot({
        metrics: [
          metric("support.tickets.open", 20, "support"),
          metric("automation.failure", 10, "automation"),
        ],
      }),
      DEFAULT_INSIGHT_THRESHOLDS,
    );

    const enriched = recommendationEngine.attachRecommendations(insights);
    const supportInsight = enriched.find((item) => item.id === "anomaly-ticket-backlog");
    const automationInsight = enriched.find((item) => item.id === "anomaly-automation-failures");

    assert.ok(supportInsight?.recommendedActions.some((action) => action.actionType === "assign_agents"));
    assert.ok(supportInsight?.recommendedActions.some((action) => action.actionType === "check_sla_backlog"));
    assert.ok(
      automationInsight?.recommendedActions.some((action) => action.actionType === "review_failed_workflows"),
    );
  });
});

describe("InsightPrioritizer", () => {
  it("orders critical alerts ahead of informational insights", () => {
    resetRecommendationEngineCounter();
    const insights = recommendationEngine.attachRecommendations(
      anomalyDetector.detect(
        baseSnapshot({
          metrics: [metric("support.tickets.open", 25, "support")],
          trends: {
            "finance.revenue": trend("finance.revenue", 60, 100, "finance"),
          },
        }),
        DEFAULT_INSIGHT_THRESHOLDS,
      ),
    );

    const prioritized = insightPrioritizer.prioritize(insights);
    assert.ok(prioritized[0].severity === "critical" || prioritized[0].severity === "high");
    assert.ok(prioritized[0].priority >= prioritized[prioritized.length - 1].priority);
  });
});

describe("ExecutiveSummaryBuilder", () => {
  it("builds health, wins, risks, and action sections", () => {
    resetRecommendationEngineCounter();
    const insights = insightPrioritizer.prioritize(
      recommendationEngine.attachRecommendations(
        anomalyDetector.detect(
          baseSnapshot({
            metrics: [metric("support.tickets.open", 25, "support")],
            trends: {
              "crm.customers.new": trend("crm.customers.new", 140, 100, "crm"),
              "finance.revenue": trend("finance.revenue", 60, 100, "finance"),
            },
          }),
          DEFAULT_INSIGHT_THRESHOLDS,
        ),
      ),
    );

    const immediateActions = recommendationEngine.collectImmediateActions(insights);
    const longTerm = recommendationEngine.collectLongTermOpportunities(insights);
    const summary = executiveSummaryBuilder.build(insights, immediateActions, longTerm);

    assert.ok(["excellent", "good", "fair", "at_risk", "critical"].includes(summary.overallBusinessHealth));
    assert.ok(summary.topRisks.length > 0);
    assert.ok(summary.immediateActions.length > 0);
    assert.ok(summary.generatedAt);
  });
});

describe("DashboardInsightEngine", () => {
  it("enriches empty dashboards with steady-state insights", () => {
    const engine = new DashboardInsightEngine();
    const enriched = engine.enrich(baseSnapshot(), { companyId: "company-1" });

    assert.ok(enriched.executiveInsights);
    assert.ok(enriched.executiveInsights.insights.some((item) => item.id === "steady-state"));
    assert.ok(enriched.executiveInsights.insights.some((item) => item.insightType === "forecast_placeholder"));
    assert.equal(enriched.executiveInsights.summary.overallBusinessHealth, "good");
  });

  it("rejects cross-company enrichment", () => {
    const engine = new DashboardInsightEngine();
    assert.throws(
      () => engine.enrich(baseSnapshot({ companyId: "company-1" }), { companyId: "company-2" }),
      /Cross-company insight generation is forbidden/,
    );
  });

  it("handles large dashboards without external calls", () => {
    const metrics = Array.from({ length: 40 }, (_, index) =>
      metric(`metric.${index}`, index + 1, "system"),
    );
    const trends = Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [
        `crm.metric.${index}`,
        trend(`crm.metric.${index}`, 100 + index * 5, 100, "crm"),
      ]),
    );

    const engine = new DashboardInsightEngine();
    const enriched = engine.enrich(baseSnapshot({ metrics, trends }), { companyId: "company-1" });

    assert.ok(enriched.executiveInsights);
    assert.ok(enriched.executiveInsights.insights.length > 0);
    assert.equal(enriched.companyId, "company-1");
  });
});
