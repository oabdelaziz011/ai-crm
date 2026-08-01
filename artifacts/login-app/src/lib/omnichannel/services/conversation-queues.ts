import type { UnifiedConversation } from "@/lib/omnichannel/types/unified-conversation";

export const OMNICHANNEL_QUEUE_IDS = [
  "unassigned",
  "mine",
  "team",
  "waiting_customer",
  "waiting_ai",
  "escalated",
  "closed_24h",
] as const;

export type OmnichannelQueueId = (typeof OMNICHANNEL_QUEUE_IDS)[number];

const CLOSED_STATES = new Set(["closed", "completed", "cancelled", "archived"]);
const CLOSED_LIFECYCLE = new Set(["CLOSED", "RESOLVED"]);

function isClosedRecently(conversation: UnifiedConversation, nowMs: number): boolean {
  if (!CLOSED_STATES.has(conversation.status) && !CLOSED_LIFECYCLE.has(conversation.lifecycleState)) {
    return false;
  }
  const activity = conversation.lastActivityAt ? Date.parse(conversation.lastActivityAt) : 0;
  return nowMs - activity <= 24 * 60 * 60 * 1000;
}

export function applyConversationQueue(
  conversations: UnifiedConversation[],
  queue: OmnichannelQueueId | undefined,
  currentUserId: string | null | undefined,
): UnifiedConversation[] {
  if (!queue) return conversations;

  const nowMs = Date.now();

  switch (queue) {
    case "unassigned":
      return conversations.filter(
        (item) =>
          !item.assignedAgent
          && !CLOSED_STATES.has(item.status)
          && !CLOSED_LIFECYCLE.has(item.lifecycleState),
      );
    case "mine":
      return conversations.filter(
        (item) =>
          item.assignedAgent?.id === currentUserId
          && !CLOSED_STATES.has(item.status)
          && !CLOSED_LIFECYCLE.has(item.lifecycleState),
      );
    case "team":
      return conversations.filter(
        (item) =>
          item.handlerMode === "human"
          && !CLOSED_STATES.has(item.status)
          && !CLOSED_LIFECYCLE.has(item.lifecycleState),
      );
    case "waiting_customer":
      return conversations.filter(
        (item) =>
          item.lifecycleState === "PENDING_CUSTOMER" || item.status === "waiting_user",
      );
    case "waiting_ai":
      return conversations.filter(
        (item) =>
          item.lifecycleState === "AI_HANDLING"
          && !CLOSED_STATES.has(item.status)
          && !CLOSED_LIFECYCLE.has(item.lifecycleState),
      );
    case "escalated":
      return conversations.filter((item) => item.isEscalated);
    case "closed_24h":
      return conversations.filter((item) => isClosedRecently(item, nowMs));
    default:
      return conversations;
  }
}

export function countQueueConversations(
  conversations: UnifiedConversation[],
  currentUserId: string | null | undefined,
): Record<OmnichannelQueueId, number> {
  return OMNICHANNEL_QUEUE_IDS.reduce(
    (counts, queueId) => {
      counts[queueId] = applyConversationQueue(conversations, queueId, currentUserId).length;
      return counts;
    },
    {} as Record<OmnichannelQueueId, number>,
  );
}
