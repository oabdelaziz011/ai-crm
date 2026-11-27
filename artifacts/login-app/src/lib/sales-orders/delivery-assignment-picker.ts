/**
 * Pure load-balancing picker for automatic delivery assignment.
 * Prefer the eligible worker with the fewest open assigned delivery orders.
 */

export type DeliveryWorkerLoadCandidate = {
  workerId: string;
  openAssignedCount: number;
  /** ISO timestamp of the worker's most recent assignment; null if never assigned. */
  lastAssignedAt: string | null;
};

/**
 * Select the eligible worker with the lowest open load.
 * Tie-break: oldest lastAssignedAt (nulls first), then workerId ascending.
 */
export function pickLeastLoadedDeliveryWorker(
  candidates: DeliveryWorkerLoadCandidate[],
): string | null {
  if (!candidates.length) return null;
  const sorted = [...candidates].sort((a, b) => {
    if (a.openAssignedCount !== b.openAssignedCount) {
      return a.openAssignedCount - b.openAssignedCount;
    }
    const aTs = a.lastAssignedAt ? Date.parse(a.lastAssignedAt) : Number.NEGATIVE_INFINITY;
    const bTs = b.lastAssignedAt ? Date.parse(b.lastAssignedAt) : Number.NEGATIVE_INFINITY;
    if (aTs !== bTs) return aTs - bTs;
    return a.workerId.localeCompare(b.workerId);
  });
  return sorted[0]?.workerId ?? null;
}
