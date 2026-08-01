import type { OptimizationHealthStatus, OptimizationRecommendation } from "../types/optimization-types";
import { estimateTotalImpact } from "./recommendation-prioritizer";

export function calculateOptimizationScore(recommendations: readonly OptimizationRecommendation[]): number {
  if (recommendations.length === 0) return 100;

  let penalty = 0;
  for (const item of recommendations) {
    const severityMultiplier = item.severity === "critical" ? 1.5 : item.severity === "warning" ? 1 : 0.5;
    penalty += (item.impact / 100) * 12 * severityMultiplier * (item.confidence / 100);
  }

  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

export function resolveOptimizationHealth(
  score: number,
  criticalCount: number,
): OptimizationHealthStatus {
  if (criticalCount > 0 || score < 50) return "critical";
  if (score < 75) return "warning";
  if (score >= 85) return "healthy";
  return "warning";
}

export function buildOptimizationDashboard(recommendations: readonly OptimizationRecommendation[]) {
  const criticalCount = recommendations.filter((item) => item.severity === "critical").length;
  const warningCount = recommendations.filter((item) => item.severity === "warning").length;
  const optimizationScore = calculateOptimizationScore(recommendations);

  return {
    optimizationScore,
    overallHealth: resolveOptimizationHealth(optimizationScore, criticalCount),
    estimatedImpact: estimateTotalImpact(recommendations),
    recommendationCount: recommendations.length,
    criticalCount,
    warningCount,
  };
}
