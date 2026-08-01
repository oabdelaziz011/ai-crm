import type { WorkflowOptimizationViewModel } from "../types/optimization-types";

export function createEmptyOptimizationViewModel(): WorkflowOptimizationViewModel {
  return {
    dashboard: {
      optimizationScore: 100,
      overallHealth: "unknown",
      estimatedImpact: 0,
      recommendationCount: 0,
      criticalCount: 0,
      warningCount: 0,
    },
    recommendations: [],
    complexity: {
      graphComplexity: 0,
      branchingComplexity: 0,
      maintainability: 100,
      readability: 100,
      nodeCount: 0,
      edgeCount: 0,
      branchCount: 0,
    },
    report: {
      executiveSummary: "",
      recommendations: [],
      score: 100,
      estimatedImpact: 0,
      risks: [],
      opportunities: [],
      exportPayload: {},
    },
  };
}
