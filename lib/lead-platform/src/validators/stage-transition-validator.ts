import { DEFAULT_STAGE_TRANSITIONS } from "../constants.js";
import { LeadStageTransitionError } from "../errors.js";
import type { LeadLifecycleStatus } from "../types/lead-types.js";

export type StageAuditSource = "ai" | "human" | "system";

export type StageTransitionOptions = {
  /**
   * When true, a human may take the one-step reverse of a graph edge.
   * It does not open arbitrary jumps, and it does not leave Won/Lost/Converted.
   */
  allowBackward?: boolean;
  /** AI and system events cannot enter or leave Won/Lost. Default is human. */
  source?: StageAuditSource;
};

const TERMINAL_NO_BACKWARD = new Set(["won", "lost", "converted"]);

function isForwardEdge(from: string, to: string): boolean {
  return (DEFAULT_STAGE_TRANSITIONS[from] ?? []).includes(to);
}

function isOneStepReverse(from: string, to: string): boolean {
  return (DEFAULT_STAGE_TRANSITIONS[to] ?? []).includes(from);
}

export function stageTransitionBlockReason(
  from: LeadLifecycleStatus | string,
  to: LeadLifecycleStatus | string,
  options?: StageTransitionOptions,
): string | null {
  if (from === to) return null;
  const source = options?.source ?? "human";
  if (isForwardEdge(from, to)) {
    if (source !== "human" && (to === "won" || to === "lost")) return "won_lost_requires_human";
    if (
      source !== "human" &&
      (from === "won" || from === "lost" || from === "converted" || from === "archived")
    ) {
      return "terminal_stage_locked";
    }
    return null;
  }
  if (options?.allowBackward && source === "human" && !TERMINAL_NO_BACKWARD.has(from) && isOneStepReverse(from, to)) {
    return null;
  }
  if (source !== "human" && (to === "won" || to === "lost")) return "won_lost_requires_human";
  return "transition_not_allowed";
}

export function isStageTransitionAllowed(
  from: LeadLifecycleStatus | string,
  to: LeadLifecycleStatus | string,
  options?: StageTransitionOptions,
): boolean {
  return stageTransitionBlockReason(from, to, options) === null;
}

export function assertStageTransition(
  from: LeadLifecycleStatus,
  to: LeadLifecycleStatus,
  options?: StageTransitionOptions,
): void {
  const reason = stageTransitionBlockReason(from, to, options);
  if (!reason) return;
  throw new LeadStageTransitionError(from, to, reason);
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
