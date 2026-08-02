import type { ConversationRecord } from "@workspace/ai-conversation";
import type {
  AssignmentTargetType,
  EscalationLevel,
  LifecycleAction,
  LifecycleMetadataOverlay,
  OwnerKind,
} from "../types/lifecycle-types.js";
import {
  readLifecycleOverlay,
  writeLifecycleOverlay,
} from "../adapters/backend-state-adapter.js";
import {
  assignConversation,
  getCurrentAssignment,
} from "../engines/assignment-engine.js";
import {
  addEscalation,
  getActiveEscalation,
  transitionEscalation,
} from "../engines/escalation-engine.js";
import { appendTimelineEvent } from "../engines/timeline-engine.js";
import { resolveConversationOwner } from "../engines/ownership-engine.js";
import {
  conversationLifecycleCoordinator,
  type CoordinatorInput,
} from "../coordinator/conversation-lifecycle-coordinator.js";
import {
  buildCancelEscalationAuditSummary,
  buildCloseAuditSummary,
  buildEscalationAuditSummary,
  buildReopenAuditSummary,
  buildResolveAuditSummary,
  buildReturnEscalationAuditSummary,
  buildReturnToAiAuditSummary,
  buildTakeOverAuditSummary,
  buildAssignmentTransferAuditSummary,
} from "@/lib/omnichannel/services/lifecycle-audit-summaries";

export type TransitionPayload = {
  assignment?: {
    targetType: AssignmentTargetType;
    targetId: string;
    targetLabel: string;
    method: "manual" | "auto" | "round_robin" | "skills" | "queue" | "bulk" | "transfer" | "escalation";
    assignedByUserId: string | null;
  };
  escalation?: {
    level: number;
    targetLevel: EscalationLevel;
    targetOwnerKind: OwnerKind;
    targetOwnerId: string | null;
    reason: string;
    priority: string;
    notes: string;
    createdByUserId: string | null;
  };
  queueId?: string | null;
  actorUserId?: string | null;
  actorLabel?: string | null;
  customerLink?: { customerId: string; customerName: string };
};

export type TransitionResult = {
  success: boolean;
  reason?: string;
  metadata?: Record<string, unknown>;
  backendHint?: ReturnType<typeof conversationLifecycleCoordinator.planAction>["backendHint"];
  validation?: ReturnType<typeof conversationLifecycleCoordinator.planAction>["validation"];
  assignedUserId?: string | null;
};

function appendAuditTimelineEvent(
  metadata: Record<string, unknown>,
  input: CoordinatorInput,
  action: LifecycleAction,
  actorUserId: string | null,
  actorLabel: string | null,
  payload: TransitionPayload,
  plan: ReturnType<typeof conversationLifecycleCoordinator.planAction>,
  assignmentId?: string | null,
): Record<string, unknown> {
  const overlay = readLifecycleOverlay(input.record.metadata) ?? {};
  const previousOwner = overlay.owner?.label ?? overlay.owner?.id ?? null;
  const previousOwnerKind = overlay.owner?.kind ?? null;
  const previousQueueId = overlay.queueId ?? null;
  const newOverlay = readLifecycleOverlay(metadata);
  const newOwner = newOverlay?.owner?.label ?? newOverlay?.owner?.id ?? null;
  const newOwnerKind = newOverlay?.owner?.kind ?? null;
  const queueId = newOverlay?.queueId ?? payload.queueId ?? previousQueueId;
  const previousState = plan.validation.fromState;
  const newState = plan.validation.toState;
  const timestamp = new Date().toISOString();
  const basePayload = {
    action,
    previousState,
    newState,
    previousOwner,
    previousOwnerKind,
    newOwner,
    newOwnerKind,
    queueId,
    handlerMode: newOwnerKind === "ai_employee" ? "ai" : newOwnerKind === "user" ? "human" : null,
  };

  if (action === "assign" || action === "reassign" || action === "transfer") {
    const assignment = payload.assignment;
    if (!assignment) return metadata;
    const reason =
      assignment.method === "manual"
        ? "Manual assignment"
        : assignment.method === "transfer"
          ? "Transfer"
          : assignment.method;
    return appendTimelineEvent(metadata, {
      conversationId: input.record.id,
      type: "assignment",
      timestamp,
      actorId: actorUserId,
      actorLabel,
      summary: buildAssignmentTransferAuditSummary(
        actorLabel,
        previousOwner,
        assignment.targetLabel,
        assignment.targetType,
        typeof queueId === "string" ? queueId : null,
        reason,
      ),
      payload: {
        ...basePayload,
        assignmentId: assignmentId ?? undefined,
        targetType: assignment.targetType,
        targetId: assignment.targetId,
        targetLabel: assignment.targetLabel,
        reason,
        method: assignment.method,
      },
    });
  }

  if (action === "take_over") {
    const assignment = payload.assignment;
    if (!assignment) return metadata;
    return appendTimelineEvent(metadata, {
      conversationId: input.record.id,
      type: "assignment",
      timestamp,
      actorId: actorUserId,
      actorLabel,
      summary: buildTakeOverAuditSummary(
        actorLabel,
        previousOwner,
        assignment.targetLabel,
        typeof queueId === "string" ? queueId : null,
      ),
      payload: {
        ...basePayload,
        assignmentId: assignmentId ?? undefined,
        targetType: assignment.targetType,
        targetId: assignment.targetId,
        targetLabel: assignment.targetLabel,
        reason: "Manual Take Over",
        method: assignment.method,
      },
    });
  }

  if (action === "escalate" && payload.escalation) {
    return appendTimelineEvent(metadata, {
      conversationId: input.record.id,
      type: "escalation",
      timestamp,
      actorId: actorUserId,
      actorLabel,
      summary: buildEscalationAuditSummary(
        actorLabel,
        payload.escalation.targetLevel,
        payload.escalation.reason,
      ),
      payload: {
        ...basePayload,
        targetLevel: payload.escalation.targetLevel,
        reason: payload.escalation.reason,
      },
    });
  }

  if (action === "return") {
    return appendTimelineEvent(metadata, {
      conversationId: input.record.id,
      type: "status_change",
      timestamp,
      actorId: actorUserId,
      actorLabel,
      summary: buildReturnEscalationAuditSummary(actorLabel),
      payload: basePayload,
    });
  }

  if (action === "escalation_cancel") {
    return appendTimelineEvent(metadata, {
      conversationId: input.record.id,
      type: "status_change",
      timestamp,
      actorId: actorUserId,
      actorLabel,
      summary: buildCancelEscalationAuditSummary(actorLabel),
      payload: basePayload,
    });
  }

  if (action === "return_to_ai") {
    return appendTimelineEvent(metadata, {
      conversationId: input.record.id,
      type: "ai_takeover",
      timestamp,
      actorId: actorUserId,
      actorLabel,
      summary: buildReturnToAiAuditSummary(actorLabel),
      payload: basePayload,
    });
  }

  if (action === "resolve") {
    return appendTimelineEvent(metadata, {
      conversationId: input.record.id,
      type: "close",
      timestamp,
      actorId: actorUserId,
      actorLabel,
      summary: buildResolveAuditSummary(actorLabel),
      payload: basePayload,
    });
  }

  if (action === "close") {
    return appendTimelineEvent(metadata, {
      conversationId: input.record.id,
      type: "close",
      timestamp,
      actorId: actorUserId,
      actorLabel,
      summary: buildCloseAuditSummary(actorLabel),
      payload: basePayload,
    });
  }

  if (action === "reopen") {
    return appendTimelineEvent(metadata, {
      conversationId: input.record.id,
      type: "reopen",
      timestamp,
      actorId: actorUserId,
      actorLabel,
      summary: buildReopenAuditSummary(actorLabel),
      payload: basePayload,
    });
  }

  return metadata;
}

export function executeLifecycleTransition(
  input: CoordinatorInput,
  action: LifecycleAction,
  payload: TransitionPayload = {},
): TransitionResult {
  const plan = conversationLifecycleCoordinator.planAction(input, action);
  if (!plan.validation.allowed) {
    return { success: false, reason: plan.validation.reason, validation: plan.validation };
  }

  let metadata = { ...input.record.metadata };
  const actorUserId = payload.actorUserId ?? null;
  const actorLabel = payload.actorLabel ?? null;
  let latestAssignmentId: string | null = null;

  if (action === "assign" || action === "reassign" || action === "take_over" || action === "transfer") {
    const assignment = payload.assignment;
    if (!assignment) {
      return { success: false, reason: "Assignment payload required" };
    }
    const { record: assignmentRecord, metadata: assignedMetadata } = assignConversation(input.record.metadata, {
      conversationId: input.record.id,
      ...assignment,
      previousAssignmentId: getCurrentAssignment(input.record.metadata)?.id ?? null,
    });
    latestAssignmentId = assignmentRecord.id;
    const overlay = readLifecycleOverlay(assignedMetadata) ?? {};
    metadata = writeLifecycleOverlay(assignedMetadata, {
      ...overlay,
      state: plan.validation.toState,
    });
  }

  if (action === "escalate") {
    if (!payload.escalation) {
      return { success: false, reason: "Escalation payload required" };
    }
    const owner = resolveConversationOwner(conversationLifecycleCoordinator.buildContext(input));
    const escalationResult = conversationLifecycleCoordinator.executeEscalation(input, {
      conversationId: input.record.id,
      ...payload.escalation,
      snapshot: {
        lifecycleState: plan.validation.toState,
        owner,
        queueId: payload.queueId ?? readLifecycleOverlay(metadata)?.queueId ?? null,
      },
    });
    if (!escalationResult.success) return escalationResult;
    metadata = escalationResult.metadata;
  }

  if (action === "return" || action === "escalation_cancel") {
    const active = getActiveEscalation(metadata);
    if (!active) {
      return { success: false, reason: "No active escalation" };
    }
    const toStatus = action === "return" ? "returned" : "cancelled";
    metadata = transitionEscalation(metadata, active.id, toStatus);
    const overlay = readLifecycleOverlay(metadata) ?? {};
    const restored = active.snapshot;
    metadata = writeLifecycleOverlay(metadata, {
      ...overlay,
      state: "ASSIGNED",
      owner: restored.owner,
      queueId: restored.queueId,
    });
  }

  if (action === "resolve" || action === "reopen" || action === "close" || action === "return_to_ai") {
    const overlay = readLifecycleOverlay(metadata) ?? {};
    const nextOverlay: LifecycleMetadataOverlay = {
      ...overlay,
      state: plan.validation.toState,
    };
    if (action === "reopen") {
      nextOverlay.reopenedAt = new Date().toISOString();
    }
    if (action === "return_to_ai") {
      const recordMetadata = input.record.metadata ?? {};
      const aiEmployeeId =
        typeof recordMetadata.aiEmployeeId === "string" && recordMetadata.aiEmployeeId.length > 0
          ? recordMetadata.aiEmployeeId
          : input.record.ai_assistant_id;
      const aiEmployeeLabel =
        typeof recordMetadata.aiEmployeeDisplayName === "string" &&
        recordMetadata.aiEmployeeDisplayName.trim()
          ? recordMetadata.aiEmployeeDisplayName.trim()
          : "AI Employee";
      nextOverlay.owner = {
        kind: "ai_employee",
        id: aiEmployeeId,
        label: aiEmployeeLabel,
      };
    }
    metadata = writeLifecycleOverlay(metadata, nextOverlay);
  }

  if (payload.queueId !== undefined) {
    const overlay = readLifecycleOverlay(metadata) ?? {};
    metadata = writeLifecycleOverlay(metadata, { ...overlay, queueId: payload.queueId });
  }

  if (payload.customerLink) {
    metadata = appendTimelineEvent(metadata, {
      conversationId: input.record.id,
      type: "ownership_change",
      timestamp: new Date().toISOString(),
      actorId: actorUserId,
      actorLabel,
      summary: `Customer linked: ${payload.customerLink.customerName}`,
      payload: { customerId: payload.customerLink.customerId },
    });
  }

  metadata = appendAuditTimelineEvent(
    metadata,
    input,
    action,
    actorUserId,
    actorLabel,
    payload,
    plan,
    latestAssignmentId,
  );

  let assignedUserId: string | null = null;
  if (payload.assignment?.targetType === "user") {
    assignedUserId = payload.assignment.targetId;
  } else if (action === "take_over" && actorUserId) {
    assignedUserId = actorUserId;
  }

  return {
    success: true,
    metadata,
    backendHint: plan.backendHint,
    validation: plan.validation,
    assignedUserId,
  };
}

export function canExecuteTransition(
  input: CoordinatorInput,
  action: LifecycleAction,
): boolean {
  return conversationLifecycleCoordinator.canPerform(input, action);
}

export function snapshotFromRecord(
  record: ConversationRecord,
  input?: Omit<CoordinatorInput, "record">,
) {
  return conversationLifecycleCoordinator.snapshot({ record, ...input });
}
