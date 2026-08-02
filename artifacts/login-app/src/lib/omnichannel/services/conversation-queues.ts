import type { UnifiedConversation } from "@/lib/omnichannel/types/unified-conversation";
import {
  hasConversationAssignee,
  resolveAssignedToUserId,
} from "@/lib/omnichannel/presentation/conversation-ownership";
import { traceReorderStage } from "@/lib/omnichannel/debug/omni-reorder-audit";

export const OMNICHANNEL_QUEUE_IDS = [
  "unassigned",
  "mine",
  "escalated",
  "waiting_customer",
  "waiting_ai",
  "resolved",
  "closed",
] as const;

export type OmnichannelQueueId = (typeof OMNICHANNEL_QUEUE_IDS)[number];

/** UI filter including the default open inbox. */
export type OmnichannelQueueFilter = OmnichannelQueueId | "all";

const CLOSED_STATES = new Set(["closed", "completed", "cancelled", "archived"]);
const CLOSED_LIFECYCLE = new Set(["CLOSED", "RESOLVED"]);

export function isTerminalConversation(conversation: UnifiedConversation): boolean {
  return CLOSED_STATES.has(conversation.status) || CLOSED_LIFECYCLE.has(conversation.lifecycleState);
}

export function isOpenConversation(conversation: UnifiedConversation): boolean {
  return !isTerminalConversation(conversation);
}

function isClosedState(conversation: UnifiedConversation): boolean {
  return conversation.lifecycleState === "CLOSED" || conversation.status === "closed";
}

function isResolvedState(conversation: UnifiedConversation): boolean {
  return conversation.lifecycleState === "RESOLVED";
}

export function applyConversationQueue(
  conversations: UnifiedConversation[],
  queue: OmnichannelQueueFilter | undefined,
  currentUserId: string | null | undefined,
): UnifiedConversation[] {
  const effective = queue ?? "all";

  let result: UnifiedConversation[];
  switch (effective) {
    case "all":
      result = conversations.filter(isOpenConversation);
      break;
    case "unassigned":
      result = conversations.filter(
        (item) => !hasConversationAssignee(item) && isOpenConversation(item),
      );
      break;
    case "mine":
      result = conversations.filter(
        (item) => resolveAssignedToUserId(item) === currentUserId && isOpenConversation(item),
      );
      break;
    case "waiting_customer":
      result = conversations.filter(
        (item) =>
          isOpenConversation(item)
          && (item.lifecycleState === "PENDING_CUSTOMER" || item.status === "waiting_user"),
      );
      break;
    case "waiting_ai":
      result = conversations.filter(
        (item) =>
          isOpenConversation(item)
          && (item.lifecycleState === "AI_HANDLING" || item.handlerMode === "ai"),
      );
      break;
    case "escalated":
      result = conversations.filter((item) => item.isEscalated && isOpenConversation(item));
      break;
    case "resolved":
      result = conversations.filter(isResolvedState);
      break;
    case "closed":
      result = conversations.filter(isClosedState);
      break;
    default:
      result = conversations;
  }

  traceReorderStage({
    stage: "applyConversationQueue",
    file: "conversation-queues.ts",
    function: "applyConversationQueue",
    line: 41,
    before: conversations,
    after: result,
    arrayReferenceChanged: true,
    sortCalled: false,
    extra: { queue: effective, currentUserId: currentUserId ?? null },
  });

  return result;
}

export function countQueueConversations(
  conversations: UnifiedConversation[],
  currentUserId: string | null | undefined,
): Record<OmnichannelQueueId, number> & { all: number } {
  const counts = OMNICHANNEL_QUEUE_IDS.reduce(
    (acc, queueId) => {
      acc[queueId] = applyConversationQueue(conversations, queueId, currentUserId).length;
      return acc;
    },
    {} as Record<OmnichannelQueueId, number>,
  );
  return {
    all: applyConversationQueue(conversations, "all", currentUserId).length,
    ...counts,
  };
}

/** @deprecated use `closed` queue */
export const LEGACY_QUEUE_ALIASES: Record<string, OmnichannelQueueFilter> = {
  closed_24h: "closed",
  team: "all",
};

export function normalizeQueueFilter(queue: string | undefined): OmnichannelQueueFilter | undefined {
  if (!queue) return undefined;
  if (queue === "all") return "all";
  if (queue in LEGACY_QUEUE_ALIASES) return LEGACY_QUEUE_ALIASES[queue];
  if ((OMNICHANNEL_QUEUE_IDS as readonly string[]).includes(queue)) {
    return queue as OmnichannelQueueId;
  }
  return undefined;
}
