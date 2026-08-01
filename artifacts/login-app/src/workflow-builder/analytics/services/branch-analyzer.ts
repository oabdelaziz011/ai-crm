import type { WorkflowDocument } from "../../core/types";
import type { TestSuiteRunRecord } from "../../testing/types/testing-types";
import type { WorkflowBranchAnalytics } from "../types/analytics-types";

function branchLabel(edge: WorkflowDocument["edges"][number]): string {
  if (edge.branchLabel) return edge.branchLabel;
  if (edge.branchKey) return String(edge.branchKey);
  return `${edge.source} → ${edge.target}`;
}

export function analyzeBranchUsage(
  document: WorkflowDocument,
  runHistory: readonly TestSuiteRunRecord[],
): WorkflowBranchAnalytics {
  const branchEdges = document.edges.filter((edge) => edge.branchKey);
  if (branchEdges.length === 0) {
    return { mostExecutedBranch: null, leastExecutedBranch: null, neverExecutedBranches: [] };
  }

  const branchCounts = new Map<string, number>();
  for (const edge of branchEdges) {
    branchCounts.set(branchLabel(edge), 0);
  }

  for (const run of runHistory) {
    for (const result of run.caseResults) {
      for (const nodeId of result.coverage.executedNodeIds) {
        for (const edge of branchEdges) {
          if (edge.source === nodeId || edge.target === nodeId) {
            const label = branchLabel(edge);
            branchCounts.set(label, (branchCounts.get(label) ?? 0) + 1);
          }
        }
      }
    }
  }

  const ranked = [...branchCounts.entries()].sort((left, right) => right[1] - left[1]);
  const neverExecutedBranches = ranked.filter(([, count]) => count === 0).map(([label]) => label);

  return {
    mostExecutedBranch: ranked[0]?.[1] ? ranked[0][0] : null,
    leastExecutedBranch: ranked.at(-1)?.[0] ?? null,
    neverExecutedBranches,
  };
}
