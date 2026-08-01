import type { TestSuiteRunRecord } from "../../testing/types/testing-types";
import type { WorkflowDocument } from "../../core/types";
import type { WorkflowFailureAnalytics } from "../types/analytics-types";

function countMessages(entries: readonly string[]): Array<{ message: string; count: number }> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry, (counts.get(entry) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([message, count]) => ({ message, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 10);
}

export function analyzeFailures(
  document: WorkflowDocument,
  runHistory: readonly TestSuiteRunRecord[],
): WorkflowFailureAnalytics {
  const assertionFailures: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const nodeFailures = new Map<string, { label: string; failureCount: number }>();

  for (const run of runHistory) {
    warnings.push(...run.report.warnings);
    for (const result of run.caseResults) {
      if (result.status !== "failed") continue;
      assertionFailures.push(...result.failures);
      const nodeId = result.snapshotSummary.currentNodeId;
      if (nodeId) {
        const node = document.nodes.find((entry) => entry.id === nodeId);
        const existing = nodeFailures.get(nodeId);
        nodeFailures.set(nodeId, {
          label: node?.type ?? nodeId,
          failureCount: (existing?.failureCount ?? 0) + 1,
        });
      }
    }
  }

  return {
    commonAssertionFailures: countMessages(assertionFailures),
    commonWarnings: countMessages(warnings),
    commonErrors: countMessages(errors),
    unstableNodes: [...nodeFailures.entries()]
      .map(([nodeId, entry]) => ({ nodeId, label: entry.label, failureCount: entry.failureCount }))
      .sort((left, right) => right.failureCount - left.failureCount)
      .slice(0, 8),
  };
}
