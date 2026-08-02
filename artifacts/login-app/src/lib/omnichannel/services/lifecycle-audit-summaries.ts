import type { AssignmentTargetType } from "@/lib/conversation-lifecycle/types/lifecycle-types";

function actorPrefix(actorLabel: string | null | undefined): string {
  return actorLabel?.trim() ? actorLabel.trim() : "An agent";
}

export function buildAssignmentAuditSummary(
  actorLabel: string | null | undefined,
  targetLabel: string,
  targetType: AssignmentTargetType,
): string {
  const actor = actorPrefix(actorLabel);
  switch (targetType) {
    case "user":
      return `${actor} assigned conversation to ${targetLabel}`;
    case "team":
      return `${actor} assigned conversation to team ${targetLabel}`;
    case "department":
      return `${actor} assigned conversation to department ${targetLabel}`;
    case "queue":
      return `${actor} assigned conversation to queue ${targetLabel}`;
    case "ai_employee":
      return `${actor} assigned conversation to AI employee ${targetLabel}`;
    default:
      return `${actor} assigned conversation to ${targetLabel}`;
  }
}

export function buildTakeOverAuditSummary(
  actorLabel: string | null | undefined,
  previousOwnerLabel: string | null | undefined,
  newOwnerLabel: string,
  queueLabel: string | null | undefined,
): string {
  const actor = actorPrefix(actorLabel);
  const from = previousOwnerLabel?.trim() || "Unassigned";
  const queueSuffix = queueLabel?.trim() ? ` Queue: ${queueLabel.trim()}` : "";
  return `${actor} assigned conversation from ${from} to ${newOwnerLabel}${queueSuffix} Reason: Manual Take Over`;
}

export function buildAssignmentTransferAuditSummary(
  actorLabel: string | null | undefined,
  previousOwnerLabel: string | null | undefined,
  newOwnerLabel: string,
  targetType: AssignmentTargetType,
  queueLabel: string | null | undefined,
  reason: string | null | undefined,
): string {
  const actor = actorPrefix(actorLabel);
  const from = previousOwnerLabel?.trim() || "Unassigned";
  const queueSuffix = queueLabel?.trim() ? ` Queue: ${queueLabel.trim()}` : "";
  const reasonSuffix = reason?.trim() ? ` Reason: ${reason.trim()}` : "";

  if (targetType === "user") {
    return `${actor} assigned conversation from ${from} to ${newOwnerLabel}${queueSuffix}${reasonSuffix}`;
  }
  return buildAssignmentAuditSummary(actorLabel, newOwnerLabel, targetType) + reasonSuffix;
}

export function buildReturnToAiAuditSummary(actorLabel: string | null | undefined): string {
  return `${actorPrefix(actorLabel)} returned conversation to AI`;
}

export function buildEscalationAuditSummary(
  actorLabel: string | null | undefined,
  targetLevel: string,
  reason: string,
): string {
  return `${actorPrefix(actorLabel)} escalated to ${targetLevel}: ${reason}`;
}

export function buildReturnEscalationAuditSummary(actorLabel: string | null | undefined): string {
  return `${actorPrefix(actorLabel)} returned conversation from escalation`;
}

export function buildCancelEscalationAuditSummary(actorLabel: string | null | undefined): string {
  return `${actorPrefix(actorLabel)} cancelled escalation`;
}

export function buildResolveAuditSummary(actorLabel: string | null | undefined): string {
  return `Conversation resolved by ${actorPrefix(actorLabel)}`;
}

export function buildCloseAuditSummary(actorLabel: string | null | undefined): string {
  return `Conversation closed by ${actorPrefix(actorLabel)}`;
}

export function buildReopenAuditSummary(actorLabel: string | null | undefined): string {
  return `Conversation reopened by ${actorPrefix(actorLabel)}`;
}

export function buildInternalNoteEditedAuditSummary(
  actorLabel: string | null | undefined,
): string {
  return `${actorPrefix(actorLabel)} edited an internal note`;
}

export function buildInternalNoteDeletedAuditSummary(
  actorLabel: string | null | undefined,
): string {
  return `${actorPrefix(actorLabel)} deleted an internal note`;
}
