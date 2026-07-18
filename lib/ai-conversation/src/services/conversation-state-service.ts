import { CONVERSATION_PERMISSIONS } from "../constants.js";
import type { ConversationState } from "../constants.js";
import {
  ConversationNotFoundError,
  InvalidStateTransitionError,
  PermissionDeniedError,
  ValidationError,
} from "../errors.js";
import type { ConversationRepository } from "../repositories/conversation-repository.js";
import type {
  ConversationRecord,
  ServiceContext,
  StateEngineMetadata,
  StateTransitionInput,
  StateTransitionResult,
} from "../types.js";
import {
  canTransition as isValidTransition,
  findTransition,
  isTerminalState,
  pickTransitionToTarget,
  resolveTransition,
  type TransitionTrigger,
} from "../state-machine/index.js";

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) {
    throw new PermissionDeniedError(permission);
  }
}

function assertCompanyAccess(ctx: ServiceContext, conversation: ConversationRecord): void {
  if (ctx.isSuperAdmin) return;
  if (conversation.company_id !== ctx.companyId) {
    throw new PermissionDeniedError(CONVERSATION_PERMISSIONS.view);
  }
}

function buildStateEngineMetadata(
  fromState: ConversationState,
  toState: ConversationState,
  trigger: TransitionTrigger,
  auditEvent: string,
): StateEngineMetadata {
  return {
    from_state: fromState,
    to_state: toState,
    last_trigger: trigger,
    last_audit_event: auditEvent,
    last_transition_at: new Date().toISOString(),
  };
}

function mergeStateEngineMetadata(
  existing: Record<string, unknown>,
  stateEngine: StateEngineMetadata,
): Record<string, unknown> {
  return {
    ...existing,
    state_engine: stateEngine,
  };
}

export class ConversationStateService {
  constructor(private readonly repository: ConversationRepository) {}

  private async getAccessibleConversation(
    ctx: ServiceContext,
    conversationId: string,
  ): Promise<ConversationRecord> {
    assertPermission(ctx, CONVERSATION_PERMISSIONS.view);

    const conversation = await this.repository.findById(conversationId);
    if (!conversation) throw new ConversationNotFoundError(conversationId);

    assertCompanyAccess(ctx, conversation);
    return conversation;
  }

  async getCurrentState(ctx: ServiceContext, conversationId: string): Promise<ConversationState> {
    const conversation = await this.getAccessibleConversation(ctx, conversationId);
    return conversation.state;
  }

  canTransition(
    ctx: ServiceContext,
    conversationId: string,
    trigger: TransitionTrigger,
  ): Promise<boolean> {
    return this.getAccessibleConversation(ctx, conversationId).then(
      (conversation) => !isTerminalState(conversation.state) && isValidTransition(conversation.state, trigger),
    );
  }

  async transition(ctx: ServiceContext, input: StateTransitionInput): Promise<StateTransitionResult> {
    assertPermission(ctx, CONVERSATION_PERMISSIONS.reply);

    const conversation = await this.getAccessibleConversation(ctx, input.conversationId);
    const fromState = conversation.state;

    if (isTerminalState(fromState)) {
      throw new InvalidStateTransitionError(fromState, input.trigger, "Terminal conversations cannot transition.");
    }

    const definition = findTransition(fromState, input.trigger);
    if (!definition) {
      throw new InvalidStateTransitionError(fromState, input.trigger);
    }

    const metadata = mergeStateEngineMetadata(
      conversation.metadata,
      buildStateEngineMetadata(fromState, definition.to, definition.trigger, definition.auditEvent),
    );

    const updated = await this.repository.applyStateTransition({
      conversationId: input.conversationId,
      fromState,
      toState: definition.to,
      trigger: definition.trigger,
      auditEvent: definition.auditEvent,
      metadata,
      updatedBy: input.updatedBy ?? ctx.userId,
    });

    return {
      conversation: updated,
      fromState,
      toState: definition.to,
      trigger: definition.trigger,
      auditEvent: definition.auditEvent,
    };
  }

  async startConversation(ctx: ServiceContext, conversationId: string): Promise<StateTransitionResult> {
    return this.transition(ctx, {
      conversationId,
      trigger: "inbound_first_message",
    });
  }

  async complete(ctx: ServiceContext, conversationId: string): Promise<StateTransitionResult> {
    const conversation = await this.getAccessibleConversation(ctx, conversationId);
    const picked = pickTransitionToTarget(conversation.state, "completed", [
      "tool_done_terminal",
      "intent_fulfilled",
    ]);
    if (!picked) {
      throw new InvalidStateTransitionError(
        conversation.state,
        "complete",
        "No valid transition to completed from the current state.",
      );
    }
    return this.transition(ctx, { conversationId, trigger: picked.trigger });
  }

  async cancel(
    ctx: ServiceContext,
    conversationId: string,
    trigger: "user_cancel" | "timeout" | "tool_failed_policy" = "user_cancel",
  ): Promise<StateTransitionResult> {
    const conversation = await this.getAccessibleConversation(ctx, conversationId);
    const picked = pickTransitionToTarget(conversation.state, "cancelled", [trigger, "user_cancel", "timeout", "tool_failed_policy"]);
    if (!picked) {
      throw new InvalidStateTransitionError(
        conversation.state,
        trigger,
        "No valid transition to cancelled from the current state.",
      );
    }
    return this.transition(ctx, { conversationId, trigger: picked.trigger });
  }

  async close(ctx: ServiceContext, conversationId: string): Promise<StateTransitionResult> {
    const conversation = await this.getAccessibleConversation(ctx, conversationId);
    if (conversation.state === "closed") {
      return {
        conversation,
        fromState: "closed",
        toState: "closed",
        trigger: "archive",
        auditEvent: "conversation_closed",
      };
    }

    const picked = pickTransitionToTarget(conversation.state, "closed", ["archive", "agent_close"]);
    if (!picked) {
      throw new InvalidStateTransitionError(
        conversation.state,
        "archive",
        "Conversation must be completed, cancelled, or transferred to human before closing.",
      );
    }
    return this.transition(ctx, { conversationId, trigger: picked.trigger });
  }

  async transferToHuman(ctx: ServiceContext, conversationId: string): Promise<StateTransitionResult> {
    assertPermission(ctx, CONVERSATION_PERMISSIONS.takeover);

    const conversation = await this.getAccessibleConversation(ctx, conversationId);
    const picked = pickTransitionToTarget(conversation.state, "transferred_to_human", [
      "handoff_requested",
      "handoff",
      "repeated_failure",
    ]);
    if (!picked) {
      throw new InvalidStateTransitionError(
        conversation.state,
        "handoff",
        "No valid transition to transferred_to_human from the current state.",
      );
    }
    return this.transition(ctx, { conversationId, trigger: picked.trigger });
  }

  async returnToAI(ctx: ServiceContext, conversationId: string): Promise<StateTransitionResult> {
    assertPermission(ctx, CONVERSATION_PERMISSIONS.release);

    const conversation = await this.getAccessibleConversation(ctx, conversationId);
    if (conversation.state !== "transferred_to_human") {
      throw new ValidationError("Only conversations transferred to human can be returned to AI.");
    }

    return this.transition(ctx, {
      conversationId,
      trigger: "agent_release_to_ai",
    });
  }

  /** Validates a trigger against the declarative table without mutating state. */
  previewTransition(fromState: ConversationState, trigger: TransitionTrigger) {
    return resolveTransition(fromState, trigger);
  }
}
