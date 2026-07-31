import type {
  DashboardBusinessHealth,
  DashboardExecutiveSummary,
  DashboardInsight,
  DashboardRecommendedAction,
} from "./insight-types.js";

export class ExecutiveSummaryBuilder {
  build(insights: DashboardInsight[], immediateActions: DashboardRecommendedAction[], longTermOpportunities: DashboardRecommendedAction[]): DashboardExecutiveSummary {
    const generatedAt = new Date().toISOString();
    const criticalCount = insights.filter((insight) => insight.severity === "critical").length;
    const highCount = insights.filter((insight) => insight.severity === "high").length;
    const positiveCount = insights.filter((insight) => insight.insightType === "positive_trend").length;

    return {
      overallBusinessHealth: this.resolveHealth(criticalCount, highCount, positiveCount),
      topWins: insights
        .filter((insight) => insight.insightType === "positive_trend" || insight.insightType === "opportunity")
        .slice(0, 3)
        .map((insight) => insight.summary),
      topRisks: insights
        .filter((insight) => insight.severity === "critical" || insight.severity === "high")
        .slice(0, 3)
        .map((insight) => insight.summary),
      immediateActions,
      longTermOpportunities,
      generatedAt,
    };
  }

  private resolveHealth(
    criticalCount: number,
    highCount: number,
    positiveCount: number,
  ): DashboardBusinessHealth {
    if (criticalCount >= 2) return "critical";
    if (criticalCount >= 1 || highCount >= 3) return "at_risk";
    if (highCount >= 1) return "fair";
    if (positiveCount >= 2) return "excellent";
    return "good";
  }
}

export const executiveSummaryBuilder = new ExecutiveSummaryBuilder();
