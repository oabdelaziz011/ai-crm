import type { ConversationRecord } from "@workspace/ai-conversation";
import type {
  AssignmentTargetType,
  LifecycleAction,
  LifecycleContext,
  LifecyclePermissionContext,
  TimelineEvent,
} from "../types/lifecycle-types.js";
import type {
  OmnichannelAgentRef,
  OmnichannelCustomerRef,
} from "@/lib/omnichannel/types/unified-conversation";
import {
  mapLifecycleActionToBackendHint,
  readLifecycleOverlay,
  resolveLifecycleState,
  writeLifecycleOverlay,
} from "../adapters/backend-state-adapter.js";
import { conversationLifecycleEngine } from "../engines/conversation-lifecycle-engine.js";
import { resolveConversationOwner, explainOwnership } from "../engines/ownership-engine.js";
import {
  assignConversation,
  acceptAssignment,
  rejectAssignment,
  getAssignmentHistory,
  getCurrentAssignment,
} from "../engines/assignment-engine.js";
import {
  addEscalation,
  transitionEscalation,
  getActiveEscalation,
  getEscalationHistory,
} from "../engines/escalation-engine.js";
import { buildConversationTimeline } from "../engines/timeline-engine.js";
import { buildConversationHeader } from "../engines/header-model.js";
import {
  canPerformLifecycleAction,
  filterAllowedActionsForRole,
  inferLifecycleRole,
} from "../engines/lifecycle-permissions.js";
import { validateAiLifecycleCommand, type AiLifecycleCommand } from "../engines/ai-lifecycle-participant.js";
import { buildTransitionMatrix } from "../engines/transition-rules.js";
import { buildAssignmentMatrix } from "../engines/assignment-engine.js";
import { buildEscalationMatrix } from "../engines/escalation-engine.js";
import { buildPermissionMatrix } from "../engines/lifecycle-permissions.js";
import { buildAiParticipantMatrix } from "../engines/ai-lifecycle-participant.js";
import {
  executeLifecycleTransition,
  type TransitionPayload,
} from "../integration/lifecycle-transition-executor.js";

export type CoordinatorInput = {
  record: ConversationRecord;
  operationalAssignment?: {
    targetType: AssignmentTargetType;
    targetId: string;
    targetLabel: string;
  } | null;
  activeQueueId?: string | null;
  permissionContext?: LifecyclePermissionContext;
  customer?: OmnichannelCustomerRef | null;
  assignedAgent?: OmnichannelAgentRef | null;
};

export type LifecycleSnapshot = {
  state: ReturnType<typeof resolveLifecycleState>;
  owner: ReturnType<typeof resolveConversationOwner>;
  ownershipExplanation: ReturnType<typeof explainOwnership>;
  allowedActions: LifecycleAction[];
  permittedActions: LifecycleAction[];
  assignmentHistory: ReturnType<typeof getAssignmentHistory>;
  currentAssignment: ReturnType<typeof getCurrentAssignment>;
  activeEscalation: ReturnType<typeof getActiveEscalation>;
  escalationHistory: ReturnType<typeof getEscalationHistory>;
  timeline: TimelineEvent[];
  header: ReturnType<typeof buildConversationHeader>;
  backendHint: ReturnType<typeof mapLifecycleActionToBackendHint> | null;
};

export class ConversationLifecycleCoordinator {
  buildContext(input: CoordinatorInput): LifecycleContext {
    const { record } = input;
    const hasActiveEscalation =
      getActiveEscalation(record.metadata) != null ||
      (readLifecycleOverlay(record.metadata)?.escalations ?? []).some(
        (e) => !["cancelled", "resolved", "returned"].includes(e.status),
      );

    return {
      conversationId: record.id,
      backendState: record.state,
      assignedUserId: record.assigned_user_id,
      aiAssistantId: record.ai_assistant_id,
      metadata: record.metadata,
      operationalAssignment: input.operationalAssignment ?? null,
      activeQueueId: input.activeQueueId ?? readLifecycleOverlay(record.metadata)?.queueId ?? null,
      hasActiveEscalation,
      lastParticipantType: record.last_participant_type,
    };
  }

  snapshot(input: CoordinatorInput, messages?: Parameters<typeof buildConversationTimeline>[0]["messages"]): LifecycleSnapshot {
    const context = this.buildContext(input);
    const state = conversationLifecycleEngine.resolveState(context);
    const allowedActions = conversationLifecycleEngine.listAllowedActions(context);

    const permissionContext =
      input.permissionContext ??
      ({
        role: "agent",
        userId: "",
        isSuperAdmin: false,
        hasPermission: () => true,
      } satisfies LifecyclePermissionContext);

    const permittedActions = filterAllowedActionsForRole(permissionContext, allowedActions);

    return {
      state,
      owner: resolveConversationOwner(context),
      ownershipExplanation: explainOwnership(context),
      allowedActions,
      permittedActions,
      assignmentHistory: getAssignmentHistory(input.record.metadata),
      currentAssignment: getCurrentAssignment(input.record.metadata),
      activeEscalation: getActiveEscalation(input.record.metadata),
      escalationHistory: getEscalationHistory(input.record.metadata),
      timeline: buildConversationTimeline({
        conversationId: input.record.id,
        metadata: input.record.metadata,
        messages,
      }),
      header: buildConversationHeader({
        conversation: input.record,
        customer: input.customer,
        assignedAgent: input.assignedAgent,
        operationalAssignment: input.operationalAssignment,
        activeQueueId: input.activeQueueId,
      }),
      backendHint: null,
    };
  }

  validateAction(input: CoordinatorInput, action: LifecycleAction) {
    const context = this.buildContext(input);
    return conversationLifecycleEngine.validateTransition(context, action);
  }

  planAction(input: CoordinatorInput, action: LifecycleAction) {
    const context = this.buildContext(input);
    const validation = conversationLifecycleEngine.validateTransition(context, action);
    const backendHint = validation.allowed
      ? mapLifecycleActionToBackendHint(action, context)
      : null;

    return { validation, backendHint };
  }

  executeAssignment(
    input: CoordinatorInput,
    assignment: {
      targetType: AssignmentTargetType;
      targetId: string;
      targetLabel: string;
      method: "manual" | "auto" | "round_robin" | "skills" | "queue" | "bulk" | "transfer";
      assignedByUserId: string | null;
    },
  ) {
    const action: LifecycleAction =
      assignment.method === "transfer" ? "transfer" : "assign";
    const plan = this.planAction(input, action);
    if (!plan.validation.allowed) {
      return { success: false as const, reason: plan.validation.reason };
    }

    const { record: assignmentRecord, metadata } = assignConversation(input.record.metadata, {
      conversationId: input.record.id,
      ...assignment,
    });

    const overlay = readLifecycleOverlay(metadata) ?? {};
    const nextMetadata = writeLifecycleOverlay(metadata, {
      ...overlay,
      state: plan.validation.toState,
    });

    return {
      success: true as const,
      metadata: nextMetadata,
      backendHint: plan.backendHint,
      assignment: assignmentRecord,
    };
  }

  executeEscalation(
    input: CoordinatorInput,
    escalation: Parameters<typeof addEscalation>[1],
  ) {
    const plan = this.planAction(input, "escalate");
    if (!plan.validation.allowed) {
      return { success: false as const, reason: plan.validation.reason };
    }
    const { record, metadata } = addEscalation(input.record.metadata, escalation);
    return { success: true as const, metadata, escalation: record, backendHint: plan.backendHint };
  }

  executeAiCommand(input: CoordinatorInput, command: AiLifecycleCommand) {
    const context = this.buildContext(input);
    return validateAiLifecycleCommand(context, command);
  }

  canPerform(input: CoordinatorInput, action: LifecycleAction): boolean {
    const context = this.buildContext(input);
    const validation = conversationLifecycleEngine.validateTransition(context, action);
    if (!validation.allowed) return false;

    if (!input.permissionContext) return true;
    return canPerformLifecycleAction(input.permissionContext, action);
  }

  transition(input: CoordinatorInput, action: LifecycleAction, payload?: TransitionPayload) {
    return executeLifecycleTransition(input, action, payload);
  }

  inferRole(ctx: LifecyclePermissionContext) {
    return inferLifecycleRole(ctx);
  }

  /** Architecture review helpers */
  getArchitectureMatrices() {
    return {
      transitions: buildTransitionMatrix(),
      ownership: ["metadata", "operational", "backend", "queue", "ai", "unassigned"],
      assignment: buildAssignmentMatrix(),
      escalation: buildEscalationMatrix(),
      permissions: buildPermissionMatrix(),
      aiParticipant: buildAiParticipantMatrix(),
    };
  }
}

export const conversationLifecycleCoordinator = new ConversationLifecycleCoordinator();
