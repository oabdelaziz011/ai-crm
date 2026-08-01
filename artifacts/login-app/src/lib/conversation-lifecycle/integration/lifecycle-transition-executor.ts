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

function appendTransitionTimeline(
  metadata: Record<string, unknown>,
  input: CoordinatorInput,
  action: LifecycleAction,
  actorUserId: string | null,
  actorLabel: string | null,
): Record<string, unknown> {
  if (["assign", "reassign", "transfer", "escalate"].includes(action)) {
    return metadata;
  }
  const plan = conversationLifecycleCoordinator.planAction(input, action);
  if (!plan.validation.allowed || !plan.validation.timelineEvent) return metadata;
  return appendTimelineEvent(metadata, {
    ...plan.validation.timelineEvent,
    actorId: actorUserId,
    actorLabel,
  });
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

  if (action === "assign" || action === "reassign" || action === "take_over" || action === "transfer") {
    const assignment = payload.assignment;
    if (!assignment) {
      return { success: false, reason: "Assignment payload required" };
    }
    const { metadata: assignedMetadata } = assignConversation(input.record.metadata, {
      conversationId: input.record.id,
      ...assignment,
      previousAssignmentId: getCurrentAssignment(input.record.metadata)?.id ?? null,
    });
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
      nextOverlay.owner = {
        kind: "ai_employee",
        id: input.record.ai_assistant_id,
        label: "AI Employee",
      };
      const current = getCurrentAssignment(metadata);
      if (current) {
        nextOverlay.owner = {
          kind: "ai_employee",
          id: input.record.ai_assistant_id,
          label: "AI Employee",
        };
      }
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

  metadata = appendTransitionTimeline(metadata, input, action, actorUserId, actorLabel);

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
