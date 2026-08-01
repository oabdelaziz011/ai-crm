import type {
  ConversationOwner,
  EscalationLevel,
  EscalationRecord,
  EscalationStatus,
  LifecycleMetadataOverlay,
  LifecycleState,
} from "../types/lifecycle-types.js";
import { readLifecycleOverlay, writeLifecycleOverlay } from "../adapters/backend-state-adapter.js";

export type CreateEscalationInput = {
  conversationId: string;
  level: number;
  targetLevel: EscalationLevel;
  targetOwnerKind: ConversationOwner["kind"];
  targetOwnerId: string | null;
  reason: string;
  priority: string;
  notes: string;
  createdByUserId: string | null;
  snapshot: EscalationRecord["snapshot"];
};

let escalationCounter = 0;

function nextEscalationId(): string {
  escalationCounter += 1;
  return `esc-${Date.now()}-${escalationCounter}`;
}

const ESCALATION_TRANSITIONS: Record<
  EscalationStatus,
  readonly EscalationStatus[]
> = {
  created: ["target_selected"],
  target_selected: ["reason_provided"],
  reason_provided: ["priority_set"],
  priority_set: ["waiting_acceptance"],
  waiting_acceptance: ["accepted", "cancelled", "returned"],
  accepted: ["returned", "resolved"],
  returned: ["resolved"],
  cancelled: [],
  resolved: [],
};

export function canEscalationTransition(
  from: EscalationStatus,
  to: EscalationStatus,
): boolean {
  return ESCALATION_TRANSITIONS[from].includes(to);
}

export function createEscalationRecord(input: CreateEscalationInput): EscalationRecord {
  return {
    id: nextEscalationId(),
    conversationId: input.conversationId,
    level: input.level,
    targetLevel: input.targetLevel,
    targetOwnerKind: input.targetOwnerKind,
    targetOwnerId: input.targetOwnerId,
    reason: input.reason,
    priority: input.priority,
    notes: input.notes,
    status: "waiting_acceptance",
    createdAt: new Date().toISOString(),
    createdByUserId: input.createdByUserId,
    acceptedAt: null,
    returnedAt: null,
    cancelledAt: null,
    resolvedAt: null,
    snapshot: input.snapshot,
  };
}

export function addEscalation(
  metadata: Record<string, unknown>,
  input: CreateEscalationInput,
): { record: EscalationRecord; metadata: Record<string, unknown> } {
  const overlay = readLifecycleOverlay(metadata) ?? {};
  const record = createEscalationRecord(input);
  const escalations = [...(overlay.escalations ?? []), record];
  const nextOverlay: LifecycleMetadataOverlay = {
    ...overlay,
    escalations,
    state: "ESCALATED" as LifecycleState,
  };
  return { record, metadata: writeLifecycleOverlay(metadata, nextOverlay) };
}

export function transitionEscalation(
  metadata: Record<string, unknown>,
  escalationId: string,
  toStatus: EscalationStatus,
): Record<string, unknown> {
  const overlay = readLifecycleOverlay(metadata) ?? {};
  const escalations = (overlay.escalations ?? []).map((entry) => {
    if (entry.id !== escalationId) return entry;
    if (!canEscalationTransition(entry.status, toStatus)) return entry;
    const now = new Date().toISOString();
    return {
      ...entry,
      status: toStatus,
      acceptedAt: toStatus === "accepted" ? now : entry.acceptedAt,
      returnedAt: toStatus === "returned" ? now : entry.returnedAt,
      cancelledAt: toStatus === "cancelled" ? now : entry.cancelledAt,
      resolvedAt: toStatus === "resolved" ? now : entry.resolvedAt,
    };
  });
  return writeLifecycleOverlay(metadata, { ...overlay, escalations });
}

export function getActiveEscalation(metadata: Record<string, unknown>): EscalationRecord | null {
  const escalations = readLifecycleOverlay(metadata)?.escalations ?? [];
  return (
    [...escalations]
      .reverse()
      .find((entry) => !["cancelled", "resolved", "returned"].includes(entry.status)) ?? null
  );
}

export function getEscalationHistory(metadata: Record<string, unknown>): EscalationRecord[] {
  return readLifecycleOverlay(metadata)?.escalations ?? [];
}

export function buildEscalationMatrix(): Record<
  EscalationStatus,
  { next: EscalationStatus[]; terminal: boolean }
> {
  const matrix = {} as Record<
    EscalationStatus,
    { next: EscalationStatus[]; terminal: boolean }
  >;
  for (const status of Object.keys(ESCALATION_TRANSITIONS) as EscalationStatus[]) {
    matrix[status] = {
      next: [...ESCALATION_TRANSITIONS[status]],
      terminal: ESCALATION_TRANSITIONS[status].length === 0,
    };
  }
  return matrix;
}

export function nextEscalationLevel(currentLevel: number): number {
  return currentLevel + 1;
}
