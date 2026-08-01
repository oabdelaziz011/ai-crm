import type { WorkflowDocument } from "../../core/types";
import { documentToSnapshot } from "../../core/lifecycle/snapshot-mapper";
import type { SimulationSnapshot } from "../../simulation/types/simulation-types";
import type { TestAssertionResult, TestCoverageSnapshot } from "../types/testing-types";

export function analyzeTestCoverage(input: {
  document: WorkflowDocument;
  snapshot: Readonly<SimulationSnapshot>;
  assertionResults: readonly TestAssertionResult[];
}): TestCoverageSnapshot {
  const runtime = documentToSnapshot(input.document);
  const report =
    input.snapshot.report ?? {
      executedNodeIds: [],
      skippedNodeIds: [],
      coveragePercent: 0,
    };
  const totalNodes = runtime.nodes.length;
  const executedNodeIds = report.executedNodeIds;
  const skippedNodeIds = report.skippedNodeIds;
  const executedSet = new Set(executedNodeIds);

  const conditionalEdges = runtime.edges.filter((edge) => {
    const condition = edge.condition as Record<string, unknown> | null | undefined;
    return condition != null && Object.keys(condition).length > 0;
  });
  const totalBranches = Math.max(conditionalEdges.length, 1);
  const selectedBranches = input.snapshot.timeline.filter(
    (entry) => entry.type === "branch_selected" || entry.type === "decision_taken",
  ).length;
  const branchCoveragePercent = Math.min(100, Math.round((selectedBranches / totalBranches) * 100));

  const triggerNode = runtime.nodes.find((node) => node.type === "trigger");
  const triggerCoveragePercent =
    triggerNode && executedSet.has(triggerNode.id)
      ? 100
      : executedNodeIds.length > 0
        ? 50
        : 0;

  const passedAssertions = input.assertionResults.filter((result) => result.passed).length;
  const assertionCoveragePercent =
    input.assertionResults.length > 0
      ? Math.round((passedAssertions / input.assertionResults.length) * 100)
      : 100;

  const nodeCoveragePercent =
    totalNodes > 0 ? Math.round((executedNodeIds.length / totalNodes) * 100) : report.coveragePercent;

  return {
    nodeCoveragePercent,
    branchCoveragePercent,
    triggerCoveragePercent,
    assertionCoveragePercent,
    executedNodeIds: [...executedNodeIds],
    skippedNodeIds: [...skippedNodeIds],
    totalNodes,
    totalBranches,
  };
}

export function mergeCoverageSnapshots(coverage: readonly TestCoverageSnapshot[]): TestCoverageSnapshot {
  if (coverage.length === 0) {
    return {
      nodeCoveragePercent: 0,
      branchCoveragePercent: 0,
      triggerCoveragePercent: 0,
      assertionCoveragePercent: 0,
      executedNodeIds: [],
      skippedNodeIds: [],
      totalNodes: 0,
      totalBranches: 0,
    };
  }

  const executedNodeIds = [...new Set(coverage.flatMap((entry) => entry.executedNodeIds))];
  const skippedNodeIds = [...new Set(coverage.flatMap((entry) => entry.skippedNodeIds))];
  const totalNodes = Math.max(...coverage.map((entry) => entry.totalNodes));
  const totalBranches = Math.max(...coverage.map((entry) => entry.totalBranches));

  const average = (selector: (entry: TestCoverageSnapshot) => number) =>
    Math.round(coverage.reduce((sum, entry) => sum + selector(entry), 0) / coverage.length);

  return {
    nodeCoveragePercent: totalNodes > 0 ? Math.round((executedNodeIds.length / totalNodes) * 100) : average((entry) => entry.nodeCoveragePercent),
    branchCoveragePercent: average((entry) => entry.branchCoveragePercent),
    triggerCoveragePercent: average((entry) => entry.triggerCoveragePercent),
    assertionCoveragePercent: average((entry) => entry.assertionCoveragePercent),
    executedNodeIds,
    skippedNodeIds,
    totalNodes,
    totalBranches,
  };
}
