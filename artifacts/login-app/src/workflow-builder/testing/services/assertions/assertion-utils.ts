import type { SimulationSnapshot } from "../../../simulation/types/simulation-types";

export function stableSerialize(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function valuesEqual(left: unknown, right: unknown): boolean {
  return stableSerialize(left) === stableSerialize(right);
}

export function readSimulationReport(snapshot: Readonly<SimulationSnapshot>) {
  return (
    snapshot.report ?? {
      durationMs: 0,
      executedNodeCount: 0,
      skippedNodeCount: 0,
      pendingNodeCount: 0,
      warningCount: 0,
      errorCount: 0,
      coveragePercent: 0,
      readinessScore: 0,
      executedNodeIds: [],
      skippedNodeIds: [],
      warnings: [],
      errors: [],
      exportPayload: {},
    }
  );
}

export function findBranchSelection(
  snapshot: Readonly<SimulationSnapshot>,
  nodeId: string,
  branchKey?: string | null,
): boolean {
  return snapshot.timeline.some((entry) => {
    if (entry.type !== "branch_selected" && entry.type !== "decision_taken") return false;
    if (entry.nodeId !== nodeId) return false;
    if (!branchKey) return true;
    return entry.detail?.includes(branchKey) ?? entry.label.includes(branchKey);
  });
}
