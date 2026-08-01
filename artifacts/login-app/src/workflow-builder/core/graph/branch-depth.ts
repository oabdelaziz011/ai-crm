import type { WorkflowDocument } from "../types";
import { extractExecutedNodeIdsFromSnapshot } from "./execution-path";
import type { SimulationSnapshot } from "../../simulation/types/simulation-types";

function buildOutgoingEdgesBySource(document: WorkflowDocument): Map<string, WorkflowDocument["edges"]> {
  const outgoing = new Map<string, WorkflowDocument["edges"]>();
  for (const edge of document.edges) {
    const edges = outgoing.get(edge.source) ?? [];
    edges.push(edge);
    outgoing.set(edge.source, edges);
  }
  return outgoing;
}

/** Deterministic branch depth from workflow graph edges along the executed path. */
export function computeBranchDepthFromGraph(
  document: WorkflowDocument,
  executedNodeIds: readonly string[],
): number {
  if (executedNodeIds.length <= 1) return 0;

  const outgoingBySource = buildOutgoingEdgesBySource(document);
  let depth = 0;

  for (let index = 1; index < executedNodeIds.length; index += 1) {
    const sourceId = executedNodeIds[index - 1]!;
    const targetId = executedNodeIds[index]!;
    const outgoing = outgoingBySource.get(sourceId) ?? [];
    const traversedEdge = outgoing.find((edge) => edge.target === targetId);

    if (traversedEdge?.branchKey) {
      depth += 1;
      continue;
    }

    if (outgoing.length > 1) {
      depth += 1;
    }
  }

  return depth;
}

export function computeBranchDepthForSnapshot(
  document: WorkflowDocument,
  snapshot: Readonly<SimulationSnapshot>,
): number {
  return computeBranchDepthFromGraph(document, extractExecutedNodeIdsFromSnapshot(snapshot));
}
