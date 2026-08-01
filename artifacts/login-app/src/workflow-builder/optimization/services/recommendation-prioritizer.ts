import type { OptimizationRecommendation } from "../types/optimization-types";

const SEVERITY_WEIGHT: Record<OptimizationRecommendation["severity"], number> = {
  info: 1,
  warning: 2,
  critical: 3,
};

export function prioritizeRecommendations(
  recommendations: readonly OptimizationRecommendation[],
): OptimizationRecommendation[] {
  return [...recommendations].sort((left, right) => {
    const leftScore = SEVERITY_WEIGHT[left.severity] * left.impact * (left.confidence / 100);
    const rightScore = SEVERITY_WEIGHT[right.severity] * right.impact * (right.confidence / 100);
    return rightScore - leftScore;
  });
}

export function estimateTotalImpact(recommendations: readonly OptimizationRecommendation[]): number {
  if (recommendations.length === 0) return 0;
  const total = recommendations.reduce((sum, item) => sum + item.impact * (item.confidence / 100), 0);
  return Math.min(100, Math.round(total / recommendations.length));
}
