import type { ConversationOwner } from "@workspace/human-handoff-platform";

export type HandoffOwnershipView = {
  ownership: ConversationOwner | null;
  /** Whether inbound AI gate should block automated replies for this ownership. */
  aiAutomatedRepliesAllowed: boolean;
  ownerKind: "ai" | "human" | "queue" | "system" | "unknown";
};

export function deriveHandoffOwnershipView(
  ownership: ConversationOwner | null,
): HandoffOwnershipView {
  if (!ownership) {
    return {
      ownership: null,
      aiAutomatedRepliesAllowed: true,
      ownerKind: "unknown",
    };
  }

  const ownerKind =
    ownership.ownerType === "ai_employee"
      ? "ai"
      : ownership.ownerType === "human_agent"
        ? "human"
        : ownership.ownerType === "queue"
          ? "queue"
          : ownership.ownerType === "system"
            ? "system"
            : "unknown";

  const blockingLifecycle = new Set([
    "WAITING_QUEUE",
    "ASSIGNED",
    "ESCALATED",
    "PAUSED",
    "RESOLVED",
    "CLOSED",
  ]);

  const aiAutomatedRepliesAllowed =
    !ownership.isPaused &&
    ownership.ownerType === "ai_employee" &&
    !ownership.assignedUserId &&
    !blockingLifecycle.has(ownership.lifecycleState);

  return { ownership, aiAutomatedRepliesAllowed, ownerKind };
}
