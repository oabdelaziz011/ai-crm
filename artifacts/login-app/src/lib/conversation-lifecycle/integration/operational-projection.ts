import type { ConversationRecord } from "@workspace/ai-conversation";
import type {
  AssignmentRecord,
  EscalationRecord as LifecycleEscalationRecord,
  EscalationLevel,
} from "../types/lifecycle-types.js";
import { readLifecycleOverlay } from "../adapters/backend-state-adapter.js";
import { getCurrentAssignment } from "../engines/assignment-engine.js";
import { getActiveEscalation, getEscalationHistory } from "../engines/escalation-engine.js";

export type OperationalAssignmentRecord = {
  targetType: AssignmentRecord["targetType"];
  targetId: string;
  targetLabel: string;
  assignedAt: string;
  assignedByUserId: string | null;
};

export type OperationalEscalationRecord = {
  id: string;
  level: EscalationLevel;
  escalateTo: EscalationLevel;
  reason: string;
  priority: string;
  notes: string;
  escalatedAt: string;
  escalatedByUserId: string | null;
  returnedAt: string | null;
  cancelledAt: string | null;
  snapshot: {
    assignment: OperationalAssignmentRecord | null;
    queue: string | null;
  };
};

function mapAssignment(record: AssignmentRecord | null): OperationalAssignmentRecord | null {
  if (!record) return null;
  return {
    targetType: record.targetType,
    targetId: record.targetId,
    targetLabel: record.targetLabel,
    assignedAt: record.assignedAt,
    assignedByUserId: record.assignedByUserId,
  };
}

function mapEscalation(
  record: LifecycleEscalationRecord,
  metadata: Record<string, unknown>,
): OperationalEscalationRecord {
  return {
    id: record.id,
    level: record.targetLevel,
    escalateTo: record.targetLevel,
    reason: record.reason,
    priority: record.priority,
    notes: record.notes,
    escalatedAt: record.createdAt,
    escalatedByUserId: record.createdByUserId,
    returnedAt: record.returnedAt,
    cancelledAt: record.cancelledAt,
    snapshot: {
      assignment: mapAssignment(getCurrentAssignment(metadata)),
      queue: record.snapshot.queueId,
    },
  };
}

export function getOperationalProjection(record: ConversationRecord) {
  const assignment = mapAssignment(getCurrentAssignment(record.metadata));
  const overlay = readLifecycleOverlay(record.metadata);
  const escalations = getEscalationHistory(record.metadata).map((entry) =>
    mapEscalation(entry, record.metadata),
  );
  return {
    assignment,
    activeQueue: overlay?.queueId ?? null,
    escalations,
  };
}

export function isConversationEscalated(record: ConversationRecord): boolean {
  return getActiveEscalation(record.metadata) != null;
}

export function getActiveOperationalEscalation(
  record: ConversationRecord,
): OperationalEscalationRecord | null {
  const active = getActiveEscalation(record.metadata);
  return active ? mapEscalation(active, record.metadata) : null;
}
