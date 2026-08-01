import type { SimulationSnapshot } from "../../simulation/types/simulation-types";

/** Ordered execution path derived from simulation timeline events. */
export function extractExecutedNodeIdsFromSnapshot(
  snapshot: Readonly<Pick<SimulationSnapshot, "timeline" | "currentNodeId">>,
): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();

  for (const entry of snapshot.timeline) {
    if (entry.type !== "node_entered" || !entry.nodeId) continue;
    if (seen.has(entry.nodeId)) continue;
    seen.add(entry.nodeId);
    ordered.push(entry.nodeId);
  }

  if (snapshot.currentNodeId && !seen.has(snapshot.currentNodeId)) {
    ordered.push(snapshot.currentNodeId);
  }

  return ordered;
}
