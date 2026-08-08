import { DEFAULT_STAGE_TRANSITIONS } from "../constants.js";
import { LeadStageTransitionError } from "../errors.js";
import type { LeadLifecycleStatus } from "../types/lead-types.js";

export type StageTransitionOptions = {
  /**
   * When true (pipeline default), any lifecycle change is allowed so Kanban
   * can move leads backward. When false, DEFAULT_STAGE_TRANSITIONS applies.
   */
  allowBackward?: boolean;
};

export function assertStageTransition(
  from: LeadLifecycleStatus,
  to: LeadLifecycleStatus,
  options?: StageTransitionOptions,
): void {
  if (from === to) return;
  if (options?.allowBackward) return;
  const allowed = DEFAULT_STAGE_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new LeadStageTransitionError(from, to);
  }
}

export function selectAssignmentCandidate(
  candidates: Array<{ userId: string; activeLeadCount: number; lastAssignedAt: string | null }>,
  method: string,
  isVip: boolean,
): string | null {
  if (!candidates.length) return null;
  if (isVip || method === "least_busy") {
    return [...candidates].sort((a, b) => a.activeLeadCount - b.activeLeadCount)[0].userId;
  }
  if (method === "round_robin") {
    return [...candidates].sort((a, b) => {
      const aTs = a.lastAssignedAt ? Date.parse(a.lastAssignedAt) : 0;
      const bTs = b.lastAssignedAt ? Date.parse(b.lastAssignedAt) : 0;
      return aTs - bTs;
    })[0].userId;
  }
  return candidates[0].userId;
}
