import type {
  LifecycleAction,
  LifecycleContext,
  LifecycleState,
  LifecycleTransitionResult,
  TimelineEventType,
} from "../types/lifecycle-types.js";
import { resolveLifecycleState } from "../adapters/backend-state-adapter.js";
import {
  isActionAllowed,
  listAllowedActions,
  listForbiddenActions,
  resolveTransitionTarget,
} from "./transition-rules.js";

function actionToTimelineType(action: LifecycleAction): TimelineEventType {
  if (action === "take_over") return "human_takeover";
  if (action === "return_to_ai" || action === "ai_release") return "ai_takeover";
  if (action === "close") return "close";
  if (action === "reopen") return "reopen";
  if (action === "assign" || action === "reassign" || action === "transfer") return "assignment";
  if (action === "escalate") return "escalation";
  if (action === "internal_note") return "internal_note";
  if (action === "ai_own" || action === "ai_request_human") return "ai_takeover";
  return "status_change";
}

export class ConversationLifecycleEngine {
  resolveState(context: LifecycleContext): LifecycleState {
    return resolveLifecycleState(context);
  }

  listAllowedActions(context: LifecycleContext): LifecycleAction[] {
    const state = this.resolveState(context);
    return [...listAllowedActions(state)];
  }

  listForbiddenActions(context: LifecycleContext): LifecycleAction[] {
    const state = this.resolveState(context);
    return listForbiddenActions(state);
  }

  validateTransition(
    context: LifecycleContext,
    action: LifecycleAction,
  ): LifecycleTransitionResult {
    const fromState = this.resolveState(context);
    const forbidden = listForbiddenActions(fromState);
    if (forbidden.includes(action)) {
      return {
        fromState,
        toState: fromState,
        action,
        allowed: false,
        reason: `Action "${action}" is forbidden in state "${fromState}"`,
      };
    }

    const toState = resolveTransitionTarget(fromState, action);
    if (!toState) {
      return {
        fromState,
        toState: fromState,
        action,
        allowed: false,
        reason: `Action "${action}" is not allowed in state "${fromState}"`,
      };
    }

    return {
      fromState,
      toState,
      action,
      allowed: true,
      timelineEvent: {
        conversationId: context.conversationId,
        type: actionToTimelineType(action),
        timestamp: new Date().toISOString(),
        actorId: null,
        actorLabel: null,
        summary: `${fromState} → ${toState} via ${action}`,
        payload: { fromState, toState, action },
      },
    };
  }

  canPerform(context: LifecycleContext, action: LifecycleAction): boolean {
    return isActionAllowed(this.resolveState(context), action);
  }

  applyTransition(
    context: LifecycleContext,
    action: LifecycleAction,
  ): { result: LifecycleTransitionResult; nextState: LifecycleState } {
    const result = this.validateTransition(context, action);
    return {
      result,
      nextState: result.allowed ? result.toState : result.fromState,
    };
  }
}

export const conversationLifecycleEngine = new ConversationLifecycleEngine();
