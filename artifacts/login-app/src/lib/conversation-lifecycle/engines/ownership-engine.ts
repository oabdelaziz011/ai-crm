import type {
  AssignmentTargetType,
  ConversationOwner,
  LifecycleContext,
  OwnerKind,
} from "../types/lifecycle-types.js";
import { readLifecycleOverlay } from "../adapters/backend-state-adapter.js";

function readAiEmployeeIdFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): string {
  if (!metadata) return "";
  for (const key of ["aiEmployeeId", "ai_employee_id", "aiAssistantId", "ai_assistant_id"] as const) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function readAiEmployeeLabelFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): string {
  if (!metadata) return "";
  for (const key of ["aiEmployeeDisplayName", "ai_employee_display_name"] as const) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function ownerFromAssignment(
  targetType: AssignmentTargetType,
  targetId: string,
  targetLabel: string,
): ConversationOwner {
  const kindMap: Record<AssignmentTargetType, OwnerKind> = {
    user: "user",
    team: "team",
    department: "department",
    queue: "queue",
    ai_employee: "ai_employee",
  };
  return { kind: kindMap[targetType], id: targetId, label: targetLabel };
}

/**
 * Resolves the single canonical owner for a conversation.
 * Priority: metadata overlay owner > operational assignment > backend assignee > AI > unassigned.
 */
export function resolveConversationOwner(context: LifecycleContext): ConversationOwner {
  const overlay = readLifecycleOverlay(context.metadata);
  if (overlay?.owner) return overlay.owner;

  if (context.operationalAssignment) {
    return ownerFromAssignment(
      context.operationalAssignment.targetType,
      context.operationalAssignment.targetId,
      context.operationalAssignment.targetLabel,
    );
  }

  if (context.assignedUserId) {
    return {
      kind: "user",
      id: context.assignedUserId,
      label: context.assignedUserId,
    };
  }

  if (context.activeQueueId) {
    return {
      kind: "queue",
      id: context.activeQueueId,
      label: context.activeQueueId,
    };
  }

  const backend = context.backendState;
  const aiStates = ["idle", "greeting", "collecting_information", "waiting_user", "waiting_api"];
  if (aiStates.includes(backend) && !context.assignedUserId) {
    const aiId = typeof context.aiAssistantId === "string" ? context.aiAssistantId.trim() : "";
    const metadataAiId = readAiEmployeeIdFromMetadata(context.metadata);
    const resolvedAiId = aiId || metadataAiId;
    // Do not claim AI ownership from backend state alone — requires a real AI assignee.
    if (!resolvedAiId) {
      return { kind: "unassigned", id: null, label: "Unassigned" };
    }
    const metadataLabel = readAiEmployeeLabelFromMetadata(context.metadata);
    return {
      kind: "ai_employee",
      id: resolvedAiId,
      label: metadataLabel || "AI Employee",
    };
  }

  return { kind: "unassigned", id: null, label: "Unassigned" };
}

export function isSameOwner(a: ConversationOwner, b: ConversationOwner): boolean {
  return a.kind === b.kind && a.id === b.id;
}

export function ownerKindLabel(kind: OwnerKind): string {
  const labels: Record<OwnerKind, string> = {
    ai_employee: "AI Employee",
    user: "User",
    team: "Team",
    department: "Department",
    queue: "Queue",
    unassigned: "Unassigned",
  };
  return labels[kind];
}

export type OwnershipMatrixEntry = {
  source: "metadata" | "operational" | "backend" | "queue" | "ai" | "unassigned";
  owner: ConversationOwner;
};

export function explainOwnership(context: LifecycleContext): OwnershipMatrixEntry {
  const overlay = readLifecycleOverlay(context.metadata);
  if (overlay?.owner) {
    return { source: "metadata", owner: overlay.owner };
  }
  if (context.operationalAssignment) {
    return {
      source: "operational",
      owner: ownerFromAssignment(
        context.operationalAssignment.targetType,
        context.operationalAssignment.targetId,
        context.operationalAssignment.targetLabel,
      ),
    };
  }
  if (context.assignedUserId) {
    return {
      source: "backend",
      owner: { kind: "user", id: context.assignedUserId, label: context.assignedUserId },
    };
  }
  if (context.activeQueueId) {
    return {
      source: "queue",
      owner: { kind: "queue", id: context.activeQueueId, label: context.activeQueueId },
    };
  }
  const aiStates = ["idle", "greeting", "collecting_information", "waiting_user", "waiting_api"];
  if (aiStates.includes(context.backendState)) {
    const aiId =
      (typeof context.aiAssistantId === "string" ? context.aiAssistantId.trim() : "")
      || readAiEmployeeIdFromMetadata(context.metadata);
    if (aiId) {
      return {
        source: "ai",
        owner: {
          kind: "ai_employee",
          id: aiId,
          label: readAiEmployeeLabelFromMetadata(context.metadata) || "AI Employee",
        },
      };
    }
  }
  return { source: "unassigned", owner: { kind: "unassigned", id: null, label: "Unassigned" } };
}
