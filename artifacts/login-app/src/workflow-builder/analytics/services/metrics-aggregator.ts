import type { TestSuiteRunRecord } from "../../testing/types/testing-types";
import type { WorkflowAnalyticsDashboard, WorkflowPerformanceMetrics } from "../types/analytics-types";

export function aggregateDashboardMetrics(input: {
  runHistory: readonly TestSuiteRunRecord[];
  latestRun: TestSuiteRunRecord | null;
  triggerExecutions: number;
}): WorkflowAnalyticsDashboard {
  const allCaseResults = input.runHistory.flatMap((run) => run.caseResults);
  const successfulTests = allCaseResults.filter((result) => result.status === "passed").length;
  const failedTests = allCaseResults.filter((result) => result.status === "failed").length;
  const durations = input.runHistory.map((run) => run.durationMs).filter((value) => value > 0);
  const averageDurationMs =
    durations.length > 0 ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null;
  const readinessScore = input.latestRun?.report.readinessScore ?? null;

  let overallHealth: WorkflowAnalyticsDashboard["overallHealth"] = "unknown";
  if (input.runHistory.length > 0 || input.triggerExecutions > 0) {
    if (failedTests === 0 && (readinessScore ?? 100) >= 80) overallHealth = "healthy";
    else if (failedTests > 0 || (readinessScore ?? 100) < 50) overallHealth = "critical";
    else overallHealth = "warning";
  }

  return {
    executions: input.triggerExecutions + input.runHistory.length,
    successfulTests,
    failedTests,
    averageDurationMs,
    readinessScore,
    overallHealth,
  };
}

export function aggregatePerformanceMetrics(input: {
  runHistory: readonly TestSuiteRunRecord[];
  profilerExecutionCount: number;
  branchExecutionCount: number;
}): WorkflowPerformanceMetrics {
  const durations = [
    ...input.runHistory.map((run) => run.durationMs),
    ...input.runHistory.flatMap((run) => run.caseResults.map((result) => result.durationMs)),
  ].filter((value) => value > 0);

  return {
    fastestExecutionMs: durations.length > 0 ? Math.min(...durations) : null,
    slowestExecutionMs: durations.length > 0 ? Math.max(...durations) : null,
    averageRuntimeMs:
      durations.length > 0 ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null,
    nodeExecutionCount: input.profilerExecutionCount,
    branchExecutionCount: input.branchExecutionCount,
  };
}
