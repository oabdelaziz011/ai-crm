import type { LifecycleAction, LifecycleContext } from "../types/lifecycle-types.js";
import { conversationLifecycleEngine } from "./conversation-lifecycle-engine.js";

/** AI Employee lifecycle participant — all actions go through validated transitions. */
export const AI_LIFECYCLE_ACTIONS = [
  "ai_own",
  "ai_release",
  "ai_request_human",
  "ai_resume",
  "ai_return",
  "ai_escalate",
] as const satisfies readonly LifecycleAction[];

export type AiLifecycleAction = (typeof AI_LIFECYCLE_ACTIONS)[number];

export type AiLifecycleCommand =
  | { action: "ai_own"; conversationId: string }
  | { action: "ai_release"; conversationId: string }
  | { action: "ai_request_human"; conversationId: string; reason?: string }
  | { action: "ai_resume"; conversationId: string }
  | { action: "ai_return"; conversationId: string }
  | { action: "ai_escalate"; conversationId: string; reason: string; priority: string };

export function mapAiCommandToLifecycleAction(command: AiLifecycleCommand): LifecycleAction {
  return command.action;
}

export function validateAiLifecycleCommand(
  context: LifecycleContext,
  command: AiLifecycleCommand,
): {
  allowed: boolean;
  action: LifecycleAction;
  reason?: string;
  nextState?: string;
} {
  const action = mapAiCommandToLifecycleAction(command);
  const { result, nextState } = conversationLifecycleEngine.applyTransition(context, action);
  return {
    allowed: result.allowed,
    action,
    reason: result.reason,
    nextState: result.allowed ? nextState : undefined,
  };
}

/** Maps AI commands to human-equivalent lifecycle actions for unified timeline. */
export function aiActionHumanLabel(action: AiLifecycleAction): string {
  const labels: Record<AiLifecycleAction, string> = {
    ai_own: "AI took ownership",
    ai_release: "AI released conversation",
    ai_request_human: "AI requested human agent",
    ai_resume: "AI resumed handling",
    ai_return: "AI returned to queue",
    ai_escalate: "AI escalated conversation",
  };
  return labels[action];
}

export function buildAiParticipantMatrix(): Record<
  AiLifecycleAction,
  { fromStates: string[]; description: string }
> {
  return {
    ai_own: {
      fromStates: ["NEW", "REOPENED", "WAITING_QUEUE"],
      description: "AI assumes ownership of conversation",
    },
    ai_release: {
      fromStates: ["ASSIGNED"],
      description: "AI releases to human or queue",
    },
    ai_request_human: {
      fromStates: ["AI_HANDLING"],
      description: "AI requests human handoff",
    },
    ai_resume: {
      fromStates: ["PENDING_CUSTOMER", "WAITING_QUEUE"],
      description: "AI resumes after customer idle",
    },
    ai_return: {
      fromStates: ["ESCALATED"],
      description: "AI returns escalated conversation",
    },
    ai_escalate: {
      fromStates: ["AI_HANDLING", "ASSIGNED"],
      description: "AI triggers escalation workflow",
    },
  };
}
