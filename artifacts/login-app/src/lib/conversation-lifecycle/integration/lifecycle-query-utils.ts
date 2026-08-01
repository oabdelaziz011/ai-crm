import type { ConversationRecord } from "@workspace/ai-conversation";
import {
  conversationLifecycleCoordinator,
  getActiveEscalation,
  readLifecycleOverlay,
  resolveLifecycleState,
  type LifecycleAction,
  type LifecyclePermissionContext,
  type LifecycleSnapshot,
} from "@/lib/conversation-lifecycle";
import type { CoordinatorInput } from "@/lib/conversation-lifecycle/coordinator/conversation-lifecycle-coordinator";

export type LifecycleSnapshotEnrichment = Pick<CoordinatorInput, "customer" | "assignedAgent">;

export function buildCoordinatorInput(
  record: ConversationRecord,
  permissionContext?: LifecyclePermissionContext,
  enrichment?: LifecycleSnapshotEnrichment,
): CoordinatorInput {
  return { record, permissionContext, ...enrichment };
}

export function getLifecycleSnapshot(
  record: ConversationRecord,
  permissionContext?: LifecyclePermissionContext,
  enrichment?: LifecycleSnapshotEnrichment,
  messages?: Parameters<typeof conversationLifecycleCoordinator.snapshot>[1],
): LifecycleSnapshot {
  return conversationLifecycleCoordinator.snapshot(
    buildCoordinatorInput(record, permissionContext, enrichment),
    messages,
  );
}

export function isRecordEscalated(record: ConversationRecord): boolean {
  return getActiveEscalation(record.metadata) != null;
}

export function getRecordLifecycleState(record: ConversationRecord): ReturnType<typeof resolveLifecycleState> {
  return resolveLifecycleState({
    conversationId: record.id,
    backendState: record.state,
    assignedUserId: record.assigned_user_id,
    aiAssistantId: record.ai_assistant_id,
    metadata: record.metadata,
    hasActiveEscalation: isRecordEscalated(record),
    lastParticipantType: record.last_participant_type,
    activeQueueId: readLifecycleOverlay(record.metadata)?.queueId ?? null,
  });
}

export function isAiLifecycleState(state: ReturnType<typeof resolveLifecycleState>): boolean {
  return state === "AI_HANDLING" || state === "NEW";
}

export function isHumanLifecycleState(state: ReturnType<typeof resolveLifecycleState>): boolean {
  return [
    "ASSIGNED",
    "ESCALATED",
    "PENDING_CUSTOMER",
    "PENDING_INTERNAL",
    "WAITING_QUEUE",
  ].includes(state);
}

export function isClosedLifecycleState(state: ReturnType<typeof resolveLifecycleState>): boolean {
  return state === "CLOSED" || state === "RESOLVED";
}

export function lifecycleActionForAssign(method: "manual" | "transfer" = "manual"): LifecycleAction {
  return method === "transfer" ? "transfer" : "assign";
}

export function lifecycleActionForTakeOver(): LifecycleAction {
  return "take_over";
}
