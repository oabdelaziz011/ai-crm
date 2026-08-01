import type { TriggerAnalyticsModel } from "../../triggers/types/trigger-types";
import type { TestSuiteRunRecord } from "../../testing/types/testing-types";
import type { SimulationReport } from "../../simulation/types/simulation-types";
import type { HotPathSummary, NodeProfilerEntry } from "../../debugger/types/debugger-advanced-types";
import type { WorkflowDocument } from "../../core/types";

export type WorkflowHealthStatus = "healthy" | "warning" | "critical" | "unknown";

export type WorkflowAnalyticsDashboard = {
  executions: number;
  successfulTests: number;
  failedTests: number;
  averageDurationMs: number | null;
  readinessScore: number | null;
  overallHealth: WorkflowHealthStatus;
};

export type WorkflowPerformanceMetrics = {
  fastestExecutionMs: number | null;
  slowestExecutionMs: number | null;
  averageRuntimeMs: number | null;
  nodeExecutionCount: number;
  branchExecutionCount: number;
};

export type WorkflowTrendPoint = {
  label: string;
  timestamp: string;
  executions: number;
  failures: number;
  successes: number;
  readinessScore: number | null;
};

export type WorkflowBranchAnalytics = {
  mostExecutedBranch: string | null;
  leastExecutedBranch: string | null;
  neverExecutedBranches: string[];
};

export type WorkflowTriggerAnalyticsView = {
  triggerType: string | null;
  executions: number;
  failures: number;
  successRate: number | null;
  averageLatencyMs: number | null;
};

export type WorkflowFailureAnalytics = {
  commonAssertionFailures: Array<{ message: string; count: number }>;
  commonWarnings: Array<{ message: string; count: number }>;
  commonErrors: Array<{ message: string; count: number }>;
  unstableNodes: Array<{ nodeId: string; label: string; failureCount: number }>;
};

export type WorkflowCoverageAnalytics = {
  nodeCoveragePercent: number;
  branchCoveragePercent: number;
  assertionCoveragePercent: number;
  triggerCoveragePercent: number;
};

export type WorkflowHeatmapIntensity = "hot" | "warm" | "cold";

export type WorkflowHeatmapEntry = {
  nodeId: string;
  label: string;
  intensity: WorkflowHeatmapIntensity;
  executionCount: number;
  isBottleneck: boolean;
};

export type WorkflowKpiDashboard = {
  workflowQuality: number;
  workflowComplexity: number;
  maintainability: number;
  stability: number;
  readiness: number;
};

export type WorkflowAnalyticsReport = {
  summary: Record<string, unknown>;
  metrics: Record<string, unknown>;
  trends: Record<string, unknown>;
  coverage: Record<string, unknown>;
  failures: Record<string, unknown>;
  bottlenecks: string[];
  recommendations: string[];
  exportPayload: Record<string, unknown>;
};

export type WorkflowAnalyticsViewModel = {
  dashboard: WorkflowAnalyticsDashboard;
  performance: WorkflowPerformanceMetrics;
  trends: WorkflowTrendPoint[];
  branches: WorkflowBranchAnalytics;
  triggers: WorkflowTriggerAnalyticsView;
  failures: WorkflowFailureAnalytics;
  coverage: WorkflowCoverageAnalytics;
  heatmap: WorkflowHeatmapEntry[];
  kpis: WorkflowKpiDashboard;
  report: WorkflowAnalyticsReport;
};

export type WorkflowAnalyticsInput = {
  document: WorkflowDocument;
  runHistory: readonly TestSuiteRunRecord[];
  latestRun: TestSuiteRunRecord | null;
  simulationReport: SimulationReport | null;
  profilerEntries: readonly NodeProfilerEntry[];
  hotPaths: readonly HotPathSummary[];
  triggerAnalytics: TriggerAnalyticsModel | null;
};
