import type {
  AssignmentMethod,
  AssignmentRecord,
  AssignmentTargetType,
  LifecycleMetadataOverlay,
} from "../types/lifecycle-types.js";
import { readLifecycleOverlay, writeLifecycleOverlay } from "../adapters/backend-state-adapter.js";

export type AssignmentInput = {
  conversationId: string;
  targetType: AssignmentTargetType;
  targetId: string;
  targetLabel: string;
  method: AssignmentMethod;
  assignedByUserId: string | null;
  previousAssignmentId?: string | null;
};

let assignmentCounter = 0;

function nextAssignmentId(): string {
  assignmentCounter += 1;
  return `asg-${Date.now()}-${assignmentCounter}`;
}

export function createAssignmentRecord(input: AssignmentInput): AssignmentRecord {
  return {
    id: nextAssignmentId(),
    conversationId: input.conversationId,
    targetType: input.targetType,
    targetId: input.targetId,
    targetLabel: input.targetLabel,
    method: input.method,
    assignedAt: new Date().toISOString(),
    assignedByUserId: input.assignedByUserId,
    acceptedAt: null,
    rejectedAt: null,
    previousAssignmentId: input.previousAssignmentId ?? null,
  };
}

export function assignConversation(
  metadata: Record<string, unknown>,
  input: AssignmentInput,
): { record: AssignmentRecord; metadata: Record<string, unknown> } {
  const overlay = readLifecycleOverlay(metadata) ?? {};
  const history = overlay.assignmentHistory ?? [];
  const previous = history.at(-1) ?? null;
  const record = createAssignmentRecord({
    ...input,
    previousAssignmentId: previous?.id ?? null,
  });
  const nextOverlay: LifecycleMetadataOverlay = {
    ...overlay,
    assignmentHistory: [...history, record],
    owner: {
      kind:
        input.targetType === "user"
          ? "user"
          : input.targetType === "team"
            ? "team"
            : input.targetType === "department"
              ? "department"
              : input.targetType === "queue"
                ? "queue"
                : "ai_employee",
      id: input.targetId,
      label: input.targetLabel,
    },
  };
  return { record, metadata: writeLifecycleOverlay(metadata, nextOverlay) };
}

export function acceptAssignment(
  metadata: Record<string, unknown>,
  assignmentId: string,
  acceptedAt = new Date().toISOString(),
): Record<string, unknown> {
  const overlay = readLifecycleOverlay(metadata) ?? {};
  const history = (overlay.assignmentHistory ?? []).map((entry) =>
    entry.id === assignmentId ? { ...entry, acceptedAt } : entry,
  );
  return writeLifecycleOverlay(metadata, { ...overlay, assignmentHistory: history });
}

export function rejectAssignment(
  metadata: Record<string, unknown>,
  assignmentId: string,
  rejectedAt = new Date().toISOString(),
): Record<string, unknown> {
  const overlay = readLifecycleOverlay(metadata) ?? {};
  const history = (overlay.assignmentHistory ?? []).map((entry) =>
    entry.id === assignmentId ? { ...entry, rejectedAt } : entry,
  );
  return writeLifecycleOverlay(metadata, { ...overlay, assignmentHistory: history });
}

export function getAssignmentHistory(metadata: Record<string, unknown>): AssignmentRecord[] {
  return readLifecycleOverlay(metadata)?.assignmentHistory ?? [];
}

export function getCurrentAssignment(metadata: Record<string, unknown>): AssignmentRecord | null {
  const history = getAssignmentHistory(metadata);
  const active = [...history].reverse().find((entry) => !entry.rejectedAt);
  return active ?? null;
}

/** Round-robin: pick next agent from pool based on last assignment index. */
export function pickRoundRobinAgent(
  agentIds: readonly string[],
  lastAssignedAgentId: string | null,
): string | null {
  if (agentIds.length === 0) return null;
  if (!lastAssignedAgentId) return agentIds[0] ?? null;
  const idx = agentIds.indexOf(lastAssignedAgentId);
  if (idx < 0) return agentIds[0] ?? null;
  return agentIds[(idx + 1) % agentIds.length] ?? null;
}

/** Skills-based: pick agent with highest matching skill score. */
export function pickSkillsBasedAgent(
  candidates: ReadonlyArray<{ agentId: string; skillScore: number }>,
): string | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => b.skillScore - a.skillScore);
  return sorted[0]?.agentId ?? null;
}

export function buildAssignmentMatrix(): Record<
  AssignmentMethod,
  { description: string; createsHistory: boolean }
> {
  return {
    manual: { description: "Direct assign by agent or supervisor", createsHistory: true },
    auto: { description: "System auto-assign from queue", createsHistory: true },
    round_robin: { description: "Rotate among available agents", createsHistory: true },
    skills: { description: "Match agent skills to conversation", createsHistory: true },
    queue: { description: "Assign from named queue", createsHistory: true },
    bulk: { description: "Bulk assign multiple conversations", createsHistory: true },
    transfer: { description: "Transfer between agents/teams", createsHistory: true },
    escalation: { description: "Assign via escalation acceptance", createsHistory: true },
  };
}
