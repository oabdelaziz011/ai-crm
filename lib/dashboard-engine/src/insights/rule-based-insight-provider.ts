import type { DashboardSnapshot } from "../types.js";
import type {
  DashboardExecutiveInsightBundle,
  DashboardInsight,
  DashboardInsightThresholds,
} from "./insight-types.js";
import { DEFAULT_INSIGHT_THRESHOLDS } from "./insight-types.js";
import type { DashboardInsightContext } from "./ports/insight-provider-ports.js";
import type { InsightProvider } from "./ports/insight-provider-ports.js";
import { anomalyDetector } from "./anomaly-detector.js";
import { trendAnalyzer } from "./trend-analyzer.js";
import { recommendationEngine, resetRecommendationEngineCounter } from "./recommendation-engine.js";
import { insightPrioritizer } from "./insight-prioritizer.js";
import { executiveSummaryBuilder } from "./executive-summary-builder.js";

function informationInsight(generatedAt: string): DashboardInsight {
  return {
    id: "steady-state",
    title: "Operations look steady",
    summary: "No critical executive alerts were detected in the current dashboard snapshot.",
    details:
      "What changed: core KPIs remain within configured thresholds. Why: no material anomalies were detected across revenue, support, automation, or AI metrics.",
    category: "operations",
    insightType: "information",
    severity: "info",
    confidence: 0.7,
    affectedMetrics: [],
    recommendedActions: [],
    priority: 10,
    generatedAt,
  };
}

function forecastPlaceholder(generatedAt: string): DashboardInsight {
  return {
    id: "forecast-placeholder",
    title: "Forecast insights reserved for future AI providers",
    summary: "Predictive forecasting will appear here when an AI forecast provider is connected.",
    details:
      "This placeholder preserves dashboard space for future LLM or forecast providers without requiring UI changes.",
    category: "finance",
    insightType: "forecast_placeholder",
    severity: "info",
    confidence: 1,
    affectedMetrics: [],
    recommendedActions: [],
    priority: 5,
    generatedAt,
  };
}

export class RuleBasedInsightProvider implements InsightProvider {
  constructor(private readonly thresholds: DashboardInsightThresholds = DEFAULT_INSIGHT_THRESHOLDS) {}

  generate(snapshot: DashboardSnapshot, context: DashboardInsightContext): DashboardExecutiveInsightBundle {
    if (snapshot.companyId !== context.companyId) {
      throw new Error("Cross-company insight generation is forbidden.");
    }

    resetRecommendationEngineCounter();
    const generatedAt = context.generatedAt ?? snapshot.refreshTimestamp ?? snapshot.capturedAt;
    const trends = snapshot.trends ?? snapshot.analytics?.kpis ?? {};

    let insights: DashboardInsight[] = [];

    if (Object.keys(trends).length === 0 && snapshot.metrics.length === 0) {
      insights = [informationInsight(generatedAt), forecastPlaceholder(generatedAt)];
    } else {
      insights = anomalyDetector.detect(snapshot, this.thresholds);

      for (const trend of trendAnalyzer.analyzeTrends(trends, this.thresholds)) {
        if (trend.insightType === "positive_trend" && trend.metricKey.includes("pipeline")) {
          insights.push({
            id: `opportunity-${trend.metricKey}`,
            title: "Pipeline momentum creates a sales opportunity",
            summary: `${trend.metricKey} is trending up, indicating expansion potential.`,
            details:
              "What changed: pipeline value increased. Why: deal activity is accelerating and may convert into revenue.",
            category: "sales",
            insightType: "opportunity",
            severity: "medium",
            confidence: 0.8,
            affectedMetrics: [trend.metricKey],
            recommendedActions: [],
            priority: 60,
            generatedAt,
          });
        }
      }

      if (insights.length === 0) {
        insights.push(informationInsight(generatedAt));
      }

      insights.push(forecastPlaceholder(generatedAt));
    }

    insights = recommendationEngine.attachRecommendations(insights);
    insights = insightPrioritizer.prioritize(insights);

    const immediateActions = recommendationEngine.collectImmediateActions(insights);
    const longTermOpportunities = recommendationEngine.collectLongTermOpportunities(insights);
    const summary = executiveSummaryBuilder.build(insights, immediateActions, longTermOpportunities);

    return {
      insights,
      summary,
      generatedAt,
    };
  }
}

export const ruleBasedInsightProvider = new RuleBasedInsightProvider();
