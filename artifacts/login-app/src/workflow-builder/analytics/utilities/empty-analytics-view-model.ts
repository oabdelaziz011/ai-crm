import type { WorkflowAnalyticsViewModel } from "../types/analytics-types";

export function createEmptyAnalyticsViewModel(): WorkflowAnalyticsViewModel {
  return {
    dashboard: {
      executions: 0,
      successfulTests: 0,
      failedTests: 0,
      averageDurationMs: null,
      readinessScore: null,
      overallHealth: "unknown",
    },
    performance: {
      fastestExecutionMs: null,
      slowestExecutionMs: null,
      averageRuntimeMs: null,
      nodeExecutionCount: 0,
      branchExecutionCount: 0,
    },
    trends: [],
    branches: { mostExecutedBranch: null, leastExecutedBranch: null, neverExecutedBranches: [] },
    triggers: {
      triggerType: null,
      executions: 0,
      failures: 0,
      successRate: null,
      averageLatencyMs: null,
    },
    failures: {
      commonAssertionFailures: [],
      commonWarnings: [],
      commonErrors: [],
      unstableNodes: [],
    },
    coverage: {
      nodeCoveragePercent: 0,
      branchCoveragePercent: 0,
      assertionCoveragePercent: 0,
      triggerCoveragePercent: 0,
    },
    heatmap: [],
    kpis: {
      workflowQuality: 0,
      workflowComplexity: 0,
      maintainability: 0,
      stability: 0,
      readiness: 0,
    },
    report: {
      summary: {},
      metrics: {},
      trends: {},
      coverage: {},
      failures: {},
      bottlenecks: [],
      recommendations: [],
      exportPayload: {},
    },
  };
}
