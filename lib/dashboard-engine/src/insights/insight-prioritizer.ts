import type { DashboardInsight } from "./insight-types.js";

const SEVERITY_WEIGHT: Record<DashboardInsight["severity"], number> = {
  critical: 100,
  high: 80,
  medium: 60,
  low: 40,
  info: 20,
};

export class InsightPrioritizer {
  prioritize(insights: DashboardInsight[]): DashboardInsight[] {
    return [...insights]
      .map((insight) => ({
        ...insight,
        priority: this.score(insight),
      }))
      .sort((left, right) => right.priority - left.priority);
  }

  score(insight: DashboardInsight): number {
    const severityScore = SEVERITY_WEIGHT[insight.severity];
    const confidenceBoost = Math.round(insight.confidence * 10);
    const actionBoost = Math.min(insight.recommendedActions.length * 3, 15);
    return Math.min(100, severityScore + confidenceBoost + actionBoost);
  }
}

export const insightPrioritizer = new InsightPrioritizer();
