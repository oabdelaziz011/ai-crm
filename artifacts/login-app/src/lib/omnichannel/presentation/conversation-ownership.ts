import { readLifecycleOverlay } from "@/lib/conversation-lifecycle/adapters/backend-state-adapter";
import { resolveUserDisplayName } from "@/lib/omnichannel/presentation/agent-display-name";
import type { Profile } from "@/lib/types";
import type { UnifiedConversation } from "@/lib/omnichannel/types/unified-conversation";

export type OwnershipTier = "human" | "ai" | "queue" | "unassigned";

export type ConversationOwnershipPresentation = {
  tier: OwnershipTier;
  displayName: string;
  assigneeUserId: string | null;
};

export type ConversationOwnershipLabels = {
  aiEmployee: string;
  unassigned: string;
};

const GENERIC_AI_ASSIGNEE_LABELS = new Set([
  "ai employee",
  "employee ai",
  "موظف ذكاء اصطناعي",
  "موظف الذكاء الاصطناعي",
]);

/** Company default assistant / fallback copy — not a real assignment. */
export function isGenericAiAssigneeLabel(label: string | null | undefined): boolean {
  const normalized = label?.trim().toLowerCase() ?? "";
  return !normalized || GENERIC_AI_ASSIGNEE_LABELS.has(normalized);
}

/**
 * Canonical assignee for "My Conversations" — backend assignee first, then lifecycle owner user.
 */
export function resolveAssignedToUserId(conversation: UnifiedConversation): string | null {
  if (conversation.source.assigned_user_id) return conversation.source.assigned_user_id;

  const overlay = readLifecycleOverlay(conversation.source.metadata);
  if (overlay?.owner?.kind === "user" && overlay.owner.id) {
    return overlay.owner.id;
  }

  return null;
}

export function resolveConversationOwnership(
  conversation: UnifiedConversation,
  agentsById: ReadonlyMap<string, { id: string; name: string }>,
  profilesByUserId: ReadonlyMap<string, Profile>,
  labels: ConversationOwnershipLabels,
  supportAgentFallback = "Support Agent",
): ConversationOwnershipPresentation {
  const assigneeUserId = resolveAssignedToUserId(conversation);
  if (assigneeUserId) {
    const overlay = readLifecycleOverlay(conversation.source.metadata);
    const rawLabel =
      overlay?.owner?.kind === "user" && overlay.owner.id === assigneeUserId
        ? overlay.owner.label
        : conversation.assignedAgent?.name ?? null;

    return {
      tier: "human",
      displayName: resolveUserDisplayName(
        assigneeUserId,
        rawLabel,
        agentsById,
        profilesByUserId,
        supportAgentFallback,
      ).display,
      assigneeUserId,
    };
  }

  const overlay = readLifecycleOverlay(conversation.source.metadata);
  const owner = overlay?.owner;
  const metadataDisplayName =
    typeof conversation.source.metadata?.aiEmployeeDisplayName === "string"
      ? conversation.source.metadata.aiEmployeeDisplayName.trim()
      : "";
  const assignedEmployeeId =
    typeof conversation.source.metadata?.aiEmployeeId === "string"
      ? conversation.source.metadata.aiEmployeeId.trim()
      : "";
  const namedOwnerLabel =
    owner?.kind === "ai_employee" && !isGenericAiAssigneeLabel(owner.label)
      ? owner.label.trim()
      : "";
  const namedMetadataLabel = !isGenericAiAssigneeLabel(metadataDisplayName)
    ? metadataDisplayName
    : "";

  // Company ai_assistant_id and the generic "AI Employee" overlay are not an assignment.
  if (assignedEmployeeId || namedOwnerLabel || namedMetadataLabel) {
    return {
      tier: "ai",
      displayName: namedOwnerLabel || namedMetadataLabel || labels.aiEmployee,
      assigneeUserId: null,
    };
  }

  if (owner?.kind === "queue" && owner.label?.trim()) {
    return { tier: "queue", displayName: owner.label, assigneeUserId: null };
  }

  const queueId = overlay?.queueId;
  if (queueId) {
    return { tier: "queue", displayName: queueId, assigneeUserId: null };
  }

  return { tier: "unassigned", displayName: labels.unassigned, assigneeUserId: null };
}

export function hasConversationAssignee(conversation: UnifiedConversation): boolean {
  return resolveAssignedToUserId(conversation) != null;
}
