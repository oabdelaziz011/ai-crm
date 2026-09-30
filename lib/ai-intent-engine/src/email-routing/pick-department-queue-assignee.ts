/**
 * Pick next employee for a department-routed email (queue-style).
 * Least-busy primary; oldest lastAssignedAt then stable userId as tiebreakers.
 * Pure — no I/O, no presence dependency (email agents may lack handoff heartbeats).
 */

export type DepartmentQueueAssigneeCandidate = {
  userId: string;
  activeConversationCount: number;
  lastAssignedAt?: string | null;
};

export function pickDepartmentQueueAssignee(
  candidates: readonly DepartmentQueueAssigneeCandidate[],
): string | null {
  const eligible = candidates
    .map((row) => ({
      userId: typeof row.userId === "string" ? row.userId.trim() : "",
      activeConversationCount:
        typeof row.activeConversationCount === "number" && Number.isFinite(row.activeConversationCount)
          ? Math.max(0, Math.floor(row.activeConversationCount))
          : 0,
      lastAssignedAt:
        typeof row.lastAssignedAt === "string" && row.lastAssignedAt.trim()
          ? row.lastAssignedAt.trim()
          : null,
    }))
    .filter((row) => row.userId.length > 0);

  if (eligible.length === 0) return null;

  eligible.sort((left, right) => {
    const countDiff = left.activeConversationCount - right.activeConversationCount;
    if (countDiff !== 0) return countDiff;
    const leftTs = left.lastAssignedAt ? Date.parse(left.lastAssignedAt) : 0;
    const rightTs = right.lastAssignedAt ? Date.parse(right.lastAssignedAt) : 0;
    const leftSafe = Number.isFinite(leftTs) ? leftTs : 0;
    const rightSafe = Number.isFinite(rightTs) ? rightTs : 0;
    if (leftSafe !== rightSafe) return leftSafe - rightSafe;
    return left.userId.localeCompare(right.userId);
  });

  return eligible[0]?.userId ?? null;
}
