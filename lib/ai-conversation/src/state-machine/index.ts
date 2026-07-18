import type { ConversationState } from "../constants.js";
import type { StateTransitionDefinition, TransitionTrigger } from "./transitions.js";
import {
  STATE_TRANSITION_DEFINITIONS,
  STATE_TRANSITION_AUDIT_EVENTS,
  TRANSITION_TRIGGERS,
  TERMINAL_CONVERSATION_STATES,
  findTransition,
  findTransitionsToTarget,
  isTerminalState,
  listAllowedTransitions,
  canTransition as canTransitionFromTable,
  resolveTransition,
} from "./transitions.js";

export {
  STATE_TRANSITION_DEFINITIONS,
  STATE_TRANSITION_AUDIT_EVENTS,
  TRANSITION_TRIGGERS,
  TERMINAL_CONVERSATION_STATES,
  findTransition,
  findTransitionsToTarget,
  listAllowedTransitions,
  isTerminalState,
  canTransitionFromTable as canTransition,
  resolveTransition,
};

export type { StateTransitionDefinition, StateTransitionAuditEvent, TransitionTrigger } from "./transitions.js";

export function pickTransitionToTarget(
  fromState: ConversationState,
  toState: ConversationState,
  preferredTriggers: TransitionTrigger[] = [],
): { trigger: TransitionTrigger; definition: StateTransitionDefinition } | null {
  const candidates = findTransitionsToTarget(fromState, toState);
  if (candidates.length === 0) return null;

  for (const preferred of preferredTriggers) {
    const match = candidates.find((candidate) => candidate.trigger === preferred);
    if (match) {
      return { trigger: match.trigger, definition: match };
    }
  }

  const first = candidates[0];
  return { trigger: first.trigger, definition: first };
}
