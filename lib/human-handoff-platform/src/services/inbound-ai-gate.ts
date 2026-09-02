import type { LifecycleState, OwnerType } from "../types/handoff-types.js";

export type InboundAiGateOwnershipSnapshot = {
  ownerType: OwnerType | string;
  isPaused: boolean;
  lifecycleState?: string | null;
  assignedUserId?: string | null;
};

export type InboundAiGateConversationSnapshot = {
  assignedUserId?: string | null;
  state?: string | null;
};

export type InboundAiGateDecisionSource =
  | "handoff_ownership"
  | "conversation_assignee"
  | "conversation_state"
  | "default_allow";

export type InboundAiGateDecision = {
  /** When false, inbound must not run AI Employee or sticky automation replies. */
  allowAutomatedReply: boolean;
  reason: string;
  source: InboundAiGateDecisionSource;
};

const BLOCKING_OWNER_TYPES = new Set<string>(["human_agent", "queue"]);

const BLOCKING_LIFECYCLE_STATES = new Set<string>([
  "WAITING_QUEUE",
  "ASSIGNED",
  "ESCALATED",
  "PAUSED",
  "RESOLVED",
  "CLOSED",
]);

/**
 * Pure inbound automation gate for Human Handoff.
 * Prefer handoff ownership when present; fall back to conversation assignee / transferred state.
 */
export function evaluateInboundAiGate(input: {
  ownership?: InboundAiGateOwnershipSnapshot | null;
  conversation?: InboundAiGateConversationSnapshot | null;
}): InboundAiGateDecision {
  const ownership = input.ownership ?? null;
  if (ownership) {
    if (ownership.isPaused) {
      return {
        allowAutomatedReply: false,
        reason: "handoff_paused",
        source: "handoff_ownership",
      };
    }

    if (BLOCKING_OWNER_TYPES.has(String(ownership.ownerType))) {
      return {
        allowAutomatedReply: false,
        reason: `owner_${ownership.ownerType}`,
        source: "handoff_ownership",
      };
    }

    const lifecycle = ownership.lifecycleState ? String(ownership.lifecycleState) : null;
    if (lifecycle && BLOCKING_LIFECYCLE_STATES.has(lifecycle)) {
      return {
        allowAutomatedReply: false,
        reason: `lifecycle_${lifecycle}`,
        source: "handoff_ownership",
      };
    }

    if (ownership.assignedUserId) {
      return {
        allowAutomatedReply: false,
        reason: "handoff_assigned_user",
        source: "handoff_ownership",
      };
    }

    // Explicit AI ownership — allow automated replies.
    if (ownership.ownerType === "ai_employee") {
      return {
        allowAutomatedReply: true,
        reason: "owner_ai_employee",
        source: "handoff_ownership",
      };
    }
  }

  const conversation = input.conversation ?? null;
  if (conversation?.assignedUserId) {
    return {
      allowAutomatedReply: false,
      reason: "conversation_assigned_user",
      source: "conversation_assignee",
    };
  }

  if (conversation?.state === "transferred_to_human") {
    return {
      allowAutomatedReply: false,
      reason: "conversation_transferred_to_human",
      source: "conversation_state",
    };
  }

  return {
    allowAutomatedReply: true,
    reason: "default_allow",
    source: "default_allow",
  };
}

export type InboundAiGateEvaluatorDeps = {
  getOwnership: (
    companyId: string,
    conversationId: string,
  ) => Promise<InboundAiGateOwnershipSnapshot | null>;
  getConversation?: (
    companyId: string,
    conversationId: string,
  ) => Promise<InboundAiGateConversationSnapshot | null>;
};

/**
 * Builds an async evaluator suitable for channel inbound ports (service-role safe).
 * Failures are surfaced to the caller — channel adapters should fail closed when wired.
 */
export function createInboundAiGateEvaluator(deps: InboundAiGateEvaluatorDeps) {
  return async (input: {
    companyId: string;
    conversationId: string;
  }): Promise<InboundAiGateDecision> => {
    const ownership = await deps.getOwnership(input.companyId, input.conversationId);
    const conversation = deps.getConversation
      ? await deps.getConversation(input.companyId, input.conversationId)
      : null;
    return evaluateInboundAiGate({ ownership, conversation });
  };
}

export function isBlockingLifecycleState(state: LifecycleState | string | null | undefined): boolean {
  return Boolean(state && BLOCKING_LIFECYCLE_STATES.has(String(state)));
}
