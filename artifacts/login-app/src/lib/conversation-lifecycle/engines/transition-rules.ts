import type { LifecycleAction, LifecycleState } from "../types/lifecycle-types.js";

export type TransitionRule = {
  action: LifecycleAction;
  toState: LifecycleState;
};

/**
 * Per-state allowed transitions. Actions not listed are forbidden.
 * CLOSED allows reopen only; terminal actions validated separately.
 */
export const LIFECYCLE_TRANSITION_RULES: Readonly<
  Record<LifecycleState, readonly TransitionRule[]>
> = {
  NEW: [
    { action: "ai_own", toState: "AI_HANDLING" },
    { action: "queue_enqueue", toState: "WAITING_QUEUE" },
    { action: "assign", toState: "ASSIGNED" },
    { action: "take_over", toState: "ASSIGNED" },
    { action: "close", toState: "CLOSED" },
  ],
  AI_HANDLING: [
    { action: "take_over", toState: "ASSIGNED" },
    { action: "assign", toState: "ASSIGNED" },
    { action: "close", toState: "CLOSED" },
    { action: "ai_request_human", toState: "WAITING_QUEUE" },
    { action: "queue_enqueue", toState: "WAITING_QUEUE" },
    { action: "customer_reply", toState: "PENDING_CUSTOMER" },
  ],
  WAITING_QUEUE: [
    { action: "assign", toState: "ASSIGNED" },
    { action: "take_over", toState: "ASSIGNED" },
    { action: "accept", toState: "ASSIGNED" },
    { action: "auto_assign", toState: "ASSIGNED" },
    { action: "round_robin_assign", toState: "ASSIGNED" },
    { action: "skills_assign", toState: "ASSIGNED" },
    { action: "queue_assign", toState: "ASSIGNED" },
    { action: "close", toState: "CLOSED" },
    { action: "ai_own", toState: "AI_HANDLING" },
  ],
  ASSIGNED: [
    { action: "reply", toState: "PENDING_CUSTOMER" },
    { action: "internal_note", toState: "ASSIGNED" },
    { action: "assign", toState: "ASSIGNED" },
    { action: "reassign", toState: "ASSIGNED" },
    { action: "transfer", toState: "ASSIGNED" },
    { action: "bulk_assign", toState: "ASSIGNED" },
    { action: "escalate", toState: "ESCALATED" },
    { action: "return_to_ai", toState: "AI_HANDLING" },
    { action: "ai_release", toState: "AI_HANDLING" },
    { action: "resolve", toState: "RESOLVED" },
    { action: "close", toState: "CLOSED" },
    { action: "customer_reply", toState: "ASSIGNED" },
    { action: "internal_resolved", toState: "ASSIGNED" },
  ],
  PENDING_CUSTOMER: [
    { action: "customer_reply", toState: "ASSIGNED" },
    { action: "reply", toState: "PENDING_CUSTOMER" },
    { action: "assign", toState: "ASSIGNED" },
    { action: "reassign", toState: "ASSIGNED" },
    { action: "escalate", toState: "ESCALATED" },
    { action: "return_to_ai", toState: "AI_HANDLING" },
    { action: "resolve", toState: "RESOLVED" },
    { action: "close", toState: "CLOSED" },
  ],
  PENDING_INTERNAL: [
    { action: "internal_resolved", toState: "ASSIGNED" },
    { action: "internal_note", toState: "PENDING_INTERNAL" },
    { action: "assign", toState: "ASSIGNED" },
    { action: "reassign", toState: "ASSIGNED" },
    { action: "escalate", toState: "ESCALATED" },
    { action: "resolve", toState: "RESOLVED" },
    { action: "close", toState: "CLOSED" },
  ],
  ESCALATED: [
    { action: "return", toState: "ASSIGNED" },
    { action: "reassign", toState: "ASSIGNED" },
    { action: "transfer", toState: "ASSIGNED" },
    { action: "escalation_accept", toState: "ASSIGNED" },
    { action: "resolve", toState: "RESOLVED" },
    { action: "close", toState: "CLOSED" },
    { action: "escalation_cancel", toState: "ASSIGNED" },
  ],
  RESOLVED: [
    { action: "close", toState: "CLOSED" },
    { action: "reopen", toState: "REOPENED" },
    { action: "assign", toState: "ASSIGNED" },
  ],
  CLOSED: [{ action: "reopen", toState: "REOPENED" }],
  REOPENED: [
    { action: "ai_own", toState: "AI_HANDLING" },
    { action: "assign", toState: "ASSIGNED" },
    { action: "take_over", toState: "ASSIGNED" },
    { action: "queue_enqueue", toState: "WAITING_QUEUE" },
    { action: "close", toState: "CLOSED" },
  ],
};

/** Explicit forbidden actions per state (documented constraints from spec). */
export const LIFECYCLE_FORBIDDEN_ACTIONS: Readonly<
  Partial<Record<LifecycleState, readonly LifecycleAction[]>>
> = {
  AI_HANDLING: ["return_to_ai", "escalate"],
  CLOSED: [
    "take_over",
    "assign",
    "reply",
    "escalate",
    "return_to_ai",
    "resolve",
    "close",
    "internal_note",
  ],
};

export function listAllowedActions(state: LifecycleState): readonly LifecycleAction[] {
  return LIFECYCLE_TRANSITION_RULES[state].map((rule) => rule.action);
}

export function listForbiddenActions(state: LifecycleState): LifecycleAction[] {
  return [...(LIFECYCLE_FORBIDDEN_ACTIONS[state] ?? [])];
}

export function resolveTransitionTarget(
  state: LifecycleState,
  action: LifecycleAction,
): LifecycleState | null {
  if (listForbiddenActions(state).includes(action)) return null;
  const rule = LIFECYCLE_TRANSITION_RULES[state].find((entry) => entry.action === action);
  return rule?.toState ?? null;
}

export function isActionAllowed(state: LifecycleState, action: LifecycleAction): boolean {
  return resolveTransitionTarget(state, action) != null;
}

export function buildTransitionMatrix(): Record<
  LifecycleState,
  { allowed: LifecycleAction[]; forbidden: LifecycleAction[] }
> {
  const matrix = {} as Record<
    LifecycleState,
    { allowed: LifecycleAction[]; forbidden: LifecycleAction[] }
  >;
  for (const state of Object.keys(LIFECYCLE_TRANSITION_RULES) as LifecycleState[]) {
    matrix[state] = {
      allowed: [...listAllowedActions(state)],
      forbidden: listForbiddenActions(state),
    };
  }
  return matrix;
}
