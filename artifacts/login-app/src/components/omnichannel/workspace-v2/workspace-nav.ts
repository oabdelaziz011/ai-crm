import type { OmnichannelListFilters } from "@/lib/omnichannel/types/unified-conversation";
import type { OmnichannelQueueFilter } from "@/lib/omnichannel/services/conversation-queues";
import type { UnifiedConversation } from "@/lib/omnichannel/types/unified-conversation";
import { applyConversationQueue, isOpenConversation } from "@/lib/omnichannel/services/conversation-queues";
import { hasConversationAssignee } from "@/lib/omnichannel/presentation/conversation-ownership";

export type WorkspaceNavId =
  | "inbox"
  | "mine"
  | "assigned"
  | "escalated"
  | "waiting"
  | "closed"
  | "ai"
  | "archived";

export const WORKSPACE_NAV_ORDER: WorkspaceNavId[] = [
  "inbox",
  "mine",
  "assigned",
  "escalated",
  "waiting",
  "closed",
  "ai",
  "archived",
];

export function workspaceNavToFilters(nav: WorkspaceNavId): OmnichannelListFilters {
  switch (nav) {
    case "inbox":
      return { queue: undefined, assignedOnly: undefined, archived: false };
    case "mine":
      return { queue: "mine", assignedOnly: undefined, archived: false };
    case "assigned":
      return { queue: "all", assignedOnly: true, archived: false };
    case "escalated":
      return { queue: "escalated", assignedOnly: undefined, archived: false };
    case "waiting":
      return { queue: "waiting_customer", assignedOnly: undefined, archived: false };
    case "closed":
      return { queue: "closed", assignedOnly: undefined, archived: false };
    case "ai":
      return { queue: "waiting_ai", assignedOnly: undefined, archived: false };
    case "archived":
      return { queue: undefined, assignedOnly: undefined, archived: true };
    default:
      return { archived: false };
  }
}

export function filtersToWorkspaceNav(filters: OmnichannelListFilters): WorkspaceNavId {
  if (filters.archived) return "archived";
  if (filters.queue === "mine") return "mine";
  if (filters.assignedOnly) return "assigned";
  if (filters.queue === "escalated") return "escalated";
  if (filters.queue === "waiting_customer") return "waiting";
  if (filters.queue === "closed") return "closed";
  if (filters.queue === "waiting_ai") return "ai";
  return "inbox";
}

export function countWorkspaceNav(
  conversations: UnifiedConversation[],
  userId: string | null | undefined,
): Record<WorkspaceNavId, number> {
  const assigned = conversations.filter((c) => hasConversationAssignee(c) && isOpenConversation(c)).length;
  const archived = conversations.filter((c) => Boolean(c.source.metadata?.archived)).length;
  return {
    inbox: applyConversationQueue(conversations, "all", userId).length,
    mine: applyConversationQueue(conversations, "mine", userId).length,
    assigned,
    escalated: applyConversationQueue(conversations, "escalated", userId).length,
    waiting: applyConversationQueue(conversations, "waiting_customer", userId).length,
    closed: applyConversationQueue(conversations, "closed", userId).length,
    ai: applyConversationQueue(conversations, "waiting_ai", userId).length,
    archived,
  };
}

export function activeQueueFromNav(nav: WorkspaceNavId): OmnichannelQueueFilter | undefined {
  const { queue } = workspaceNavToFilters(nav);
  return queue;
}
