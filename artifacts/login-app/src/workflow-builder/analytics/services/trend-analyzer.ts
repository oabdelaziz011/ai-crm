import type { TestSuiteRunRecord } from "../../testing/types/testing-types";
import type { WorkflowTrendPoint } from "../types/analytics-types";

export function analyzeExecutionTrends(runHistory: readonly TestSuiteRunRecord[]): WorkflowTrendPoint[] {
  if (runHistory.length === 0) return [];

  const chronological = [...runHistory].reverse();
  return chronological.map((run, index) => ({
    label: `Run ${index + 1}`,
    timestamp: run.startedAt,
    executions: run.passed + run.failed + run.skipped,
    failures: run.failed,
    successes: run.passed,
    readinessScore: run.report.readinessScore,
  }));
}
