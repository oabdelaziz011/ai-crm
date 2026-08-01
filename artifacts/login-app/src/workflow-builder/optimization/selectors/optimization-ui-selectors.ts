import type { OptimizationRecommendation } from "../types/optimization-types";

export function groupRecommendationsByCategory(
  recommendations: readonly OptimizationRecommendation[],
): Record<OptimizationRecommendation["category"], OptimizationRecommendation[]> {
  const groups: Record<OptimizationRecommendation["category"], OptimizationRecommendation[]> = {
    performance: [],
    structure: [],
    ai: [],
    trigger: [],
    reliability: [],
    complexity: [],
    branch: [],
  };

  for (const item of recommendations) {
    groups[item.category].push(item);
  }

  return groups;
}

export function countRecommendationsBySeverity(recommendations: readonly OptimizationRecommendation[]) {
  return {
    critical: recommendations.filter((item) => item.severity === "critical").length,
    warning: recommendations.filter((item) => item.severity === "warning").length,
    info: recommendations.filter((item) => item.severity === "info").length,
  };
}
