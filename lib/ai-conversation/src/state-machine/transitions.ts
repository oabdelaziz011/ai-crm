import type { ConversationState } from "../constants.js";

/** Transition triggers from docs/architecture/ai-platform.md §5 */
export const TRANSITION_TRIGGERS = [
  "inbound_first_message",
  "intent_requires_slots",
  "question_asked",
  "tool_invoked",
  "intent_fulfilled",
  "handoff_requested",
  "prompt_user",
  "slots_complete",
  "user_cancel",
  "timeout",
  "handoff",
  "user_reply",
  "tool_done_follow_up",
  "tool_done_terminal",
  "tool_failed_policy",
  "repeated_failure",
  "archive",
  "agent_close",
  "agent_release_to_ai",
] as const;

export type TransitionTrigger = (typeof TRANSITION_TRIGGERS)[number];

export const STATE_TRANSITION_AUDIT_EVENTS = [
  "conversation_started",
  "greeting_completed",
  "waiting_for_customer",
  "waiting_for_tool",
  "conversation_completed",
  "conversation_cancelled",
  "conversation_closed",
  "transferred_to_human",
  "returned_to_ai",
  "state_changed",
] as const;

export type StateTransitionAuditEvent = (typeof STATE_TRANSITION_AUDIT_EVENTS)[number];

export type StateTransitionDefinition = {
  from: ConversationState;
  to: ConversationState;
  trigger: TransitionTrigger;
  auditEvent: StateTransitionAuditEvent;
};

/**
 * Declarative transition table — single source of truth for the state machine.
 * Add new rows here to extend the machine without branching logic.
 */
export const STATE_TRANSITION_DEFINITIONS: readonly StateTransitionDefinition[] = [
  { from: "idle", to: "greeting", trigger: "inbound_first_message", auditEvent: "conversation_started" },

  { from: "greeting", to: "collecting_information", trigger: "intent_requires_slots", auditEvent: "greeting_completed" },
  { from: "greeting", to: "waiting_user", trigger: "question_asked", auditEvent: "waiting_for_customer" },
  { from: "greeting", to: "waiting_api", trigger: "tool_invoked", auditEvent: "waiting_for_tool" },
  { from: "greeting", to: "completed", trigger: "intent_fulfilled", auditEvent: "conversation_completed" },
  { from: "greeting", to: "transferred_to_human", trigger: "handoff_requested", auditEvent: "transferred_to_human" },

  { from: "collecting_information", to: "waiting_user", trigger: "prompt_user", auditEvent: "waiting_for_customer" },
  { from: "collecting_information", to: "waiting_api", trigger: "slots_complete", auditEvent: "waiting_for_tool" },
  { from: "collecting_information", to: "cancelled", trigger: "user_cancel", auditEvent: "conversation_cancelled" },
  { from: "collecting_information", to: "cancelled", trigger: "timeout", auditEvent: "conversation_cancelled" },
  { from: "collecting_information", to: "transferred_to_human", trigger: "handoff", auditEvent: "transferred_to_human" },

  { from: "waiting_user", to: "collecting_information", trigger: "user_reply", auditEvent: "state_changed" },
  { from: "waiting_user", to: "cancelled", trigger: "timeout", auditEvent: "conversation_cancelled" },
  { from: "waiting_user", to: "cancelled", trigger: "user_cancel", auditEvent: "conversation_cancelled" },
  { from: "waiting_user", to: "transferred_to_human", trigger: "handoff", auditEvent: "transferred_to_human" },

  { from: "waiting_api", to: "waiting_user", trigger: "tool_done_follow_up", auditEvent: "waiting_for_customer" },
  { from: "waiting_api", to: "completed", trigger: "tool_done_terminal", auditEvent: "conversation_completed" },
  { from: "waiting_api", to: "cancelled", trigger: "tool_failed_policy", auditEvent: "conversation_cancelled" },
  { from: "waiting_api", to: "transferred_to_human", trigger: "repeated_failure", auditEvent: "transferred_to_human" },

  { from: "completed", to: "closed", trigger: "archive", auditEvent: "conversation_closed" },
  { from: "cancelled", to: "closed", trigger: "archive", auditEvent: "conversation_closed" },
  { from: "transferred_to_human", to: "closed", trigger: "agent_close", auditEvent: "conversation_closed" },
  { from: "transferred_to_human", to: "greeting", trigger: "agent_release_to_ai", auditEvent: "returned_to_ai" },
] as const;

export const TERMINAL_CONVERSATION_STATES: readonly ConversationState[] = ["closed"];

export function isTerminalState(state: ConversationState): boolean {
  return TERMINAL_CONVERSATION_STATES.includes(state);
}

export function findTransition(
  fromState: ConversationState,
  trigger: TransitionTrigger,
): StateTransitionDefinition | null {
  return (
    STATE_TRANSITION_DEFINITIONS.find(
      (definition) => definition.from === fromState && definition.trigger === trigger,
    ) ?? null
  );
}

export function findTransitionsToTarget(
  fromState: ConversationState,
  toState: ConversationState,
): StateTransitionDefinition[] {
  return STATE_TRANSITION_DEFINITIONS.filter(
    (definition) => definition.from === fromState && definition.to === toState,
  );
}

export function listAllowedTransitions(fromState: ConversationState): StateTransitionDefinition[] {
  return STATE_TRANSITION_DEFINITIONS.filter((definition) => definition.from === fromState);
}

export function canTransition(
  fromState: ConversationState,
  trigger: TransitionTrigger,
): boolean {
  return findTransition(fromState, trigger) != null;
}

export function resolveTransition(
  fromState: ConversationState,
  trigger: TransitionTrigger,
): StateTransitionDefinition {
  const transition = findTransition(fromState, trigger);
  if (!transition) {
    throw new Error(`Invalid transition: ${fromState} -> (${trigger})`);
  }
  return transition;
}
