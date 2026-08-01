import type { WorkflowDocument } from "../../core/types";
import type { NodeProfilerEntry } from "../../debugger/types/debugger-advanced-types";
import type { TestSuiteRunRecord } from "../../testing/types/testing-types";
import type { WorkflowHeatmapEntry } from "../types/analytics-types";

function readNodeLabel(document: WorkflowDocument, nodeId: string): string {
  const node = document.nodes.find((entry) => entry.id === nodeId);
  return node?.type ?? nodeId;
}

export function generateWorkflowHeatmap(input: {
  document: WorkflowDocument;
  runHistory: readonly TestSuiteRunRecord[];
  profilerEntries: readonly NodeProfilerEntry[];
  bottlenecks: readonly string[];
}): WorkflowHeatmapEntry[] {
  const executionCounts = new Map<string, number>();

  for (const entry of input.profilerEntries) {
    executionCounts.set(entry.nodeId, entry.executionCount);
  }

  for (const run of input.runHistory) {
    for (const result of run.caseResults) {
      for (const nodeId of result.coverage.executedNodeIds) {
        executionCounts.set(nodeId, (executionCounts.get(nodeId) ?? 0) + 1);
      }
    }
  }

  const maxCount = Math.max(...executionCounts.values(), 1);
  const bottleneckNodes = new Set(
    input.bottlenecks
      .map((entry) => input.document.nodes.find((node) => entry.includes(node.id))?.id)
      .filter((nodeId): nodeId is string => Boolean(nodeId)),
  );

  return input.document.nodes.map((node) => {
    const executionCount = executionCounts.get(node.id) ?? 0;
    const ratio = executionCount / maxCount;
    let intensity: WorkflowHeatmapEntry["intensity"] = "cold";
    if (ratio >= 0.66) intensity = "hot";
    else if (ratio >= 0.33) intensity = "warm";

    return {
      nodeId: node.id,
      label: readNodeLabel(input.document, node.id),
      intensity,
      executionCount,
      isBottleneck: bottleneckNodes.has(node.id) || input.bottlenecks.some((entry) => entry.includes(node.id)),
    };
  });
}
