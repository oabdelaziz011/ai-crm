/**
 * Email Workspace metric KPI → list filter mapping.
 * Counts stay in useEmailWorkspaceMetrics; this only selects which conversations appear.
 */
import type { ConversationRecord } from "@workspace/ai-conversation";
import {
  classifyEmailWorkspaceListBucket,
  isEmailWorkspaceInboxConversation,
  isEmailWorkspacePendingConversation,
} from "@/lib/email-workspace/email-workspace-list-item";
import {
  type EmailWorkspaceAssigneeFilter,
  writeAssigneeToSearchParams,
} from "@/lib/email-workspace/email-workspace-assignee-filter";

export const EMAIL_WORKSPACE_METRIC_FILTERS = [
  "incoming",
  "sent",
  "pending",
  "failed",
  "aiRouted",
  "ticketsCreated",
] as const;

export type EmailWorkspaceMetricFilter = (typeof EMAIL_WORKSPACE_METRIC_FILTERS)[number];

const METRIC_SET = new Set<string>(EMAIL_WORKSPACE_METRIC_FILTERS);

/** Query param used on `/dashboard/email` for KPI navigation. */
export const EMAIL_WORKSPACE_METRIC_QUERY_KEY = "metric";

export function isEmailWorkspaceMetricFilter(value: string): value is EmailWorkspaceMetricFilter {
  return METRIC_SET.has(value);
}

export function parseEmailWorkspaceMetricFilter(
  raw: string | null | undefined,
): EmailWorkspaceMetricFilter | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return isEmailWorkspaceMetricFilter(trimmed) ? trimmed : null;
}

/** Default list view matches today's Inbox behavior. */
export function resolveEmailWorkspaceMetricFilter(
  raw: string | null | undefined,
): EmailWorkspaceMetricFilter {
  return parseEmailWorkspaceMetricFilter(raw) ?? "incoming";
}

export function readEmailWorkspaceMetricFromSearch(
  search: string,
): EmailWorkspaceMetricFilter {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return resolveEmailWorkspaceMetricFilter(params.get(EMAIL_WORKSPACE_METRIC_QUERY_KEY));
}

/**
 * Build nested Email Inbox href with metric (+ optional conversation) preserved.
 * Uses relative `/?…` form consistent with EmailWorkspacePanel nest navigation.
 */
export function buildEmailWorkspaceMetricSearch(input: {
  metric: EmailWorkspaceMetricFilter;
  conversationId?: string | null;
  compose?: string | null;
  /** Preserve Assigned To filter across metric / selection navigation. */
  assignee?: EmailWorkspaceAssigneeFilter | null;
}): string {
  const params = new URLSearchParams();
  if (input.metric !== "sent") {
    params.set(EMAIL_WORKSPACE_METRIC_QUERY_KEY, input.metric);
  }
  const conversation = input.conversationId?.trim();
  if (conversation) params.set("conversation", conversation);
  const compose = input.compose?.trim();
  if (compose) params.set("compose", compose);
  writeAssigneeToSearchParams(params, input.assignee);

  if (input.metric === "sent") {
    const qs = params.toString();
    return qs ? `/sent?${qs}` : "/sent";
  }

  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

export function conversationHasEmailAiRouting(
  conversation: Pick<ConversationRecord, "metadata">,
): boolean {
  const meta = conversation.metadata;
  return Boolean(meta && typeof meta === "object" && meta.emailRoutingClassification != null);
}

export function conversationHasSuccessfulEmailOutbound(
  conversation: Pick<
    ConversationRecord,
    "last_message_at" | "last_message_preview" | "last_participant_type"
  >,
): boolean {
  return (
    Boolean(conversation.last_message_at || conversation.last_message_preview?.trim()) &&
    (conversation.last_participant_type === "employee" ||
      conversation.last_participant_type === "assistant")
  );
}

export function conversationHasFailedEmailOutbound(
  conversation: Pick<ConversationRecord, "metadata">,
): boolean {
  const meta = conversation.metadata;
  if (!meta || typeof meta !== "object") return false;
  return (
    meta.emailLastOutboundStatus === "failed" || meta.lastOutboundStatus === "failed"
  );
}

export type EmailWorkspaceMetricMatchContext = {
  /** Conversation IDs from support_tickets with metadata.source=email (same criteria as metric count). */
  ticketConversationIds?: ReadonlySet<string> | null;
};

/**
 * Whether a conversation belongs under a KPI filter.
 * Reuses Inbox/Pending bucket classifiers; does not change count math.
 */
export function matchesEmailWorkspaceMetricFilter(
  conversation: ConversationRecord,
  filter: EmailWorkspaceMetricFilter,
  context: EmailWorkspaceMetricMatchContext = {},
): boolean {
  if (classifyEmailWorkspaceListBucket(conversation) === "discarded") return false;

  switch (filter) {
    case "incoming":
      return (
        isEmailWorkspaceInboxConversation(conversation) &&
        !conversationHasSuccessfulEmailOutbound(conversation)
      );
    case "pending":
      return isEmailWorkspacePendingConversation(conversation);
    case "sent":
      return conversationHasSuccessfulEmailOutbound(conversation);
    case "failed":
      return conversationHasFailedEmailOutbound(conversation);
    case "aiRouted":
      return conversationHasEmailAiRouting(conversation);
    case "ticketsCreated": {
      const ids = context.ticketConversationIds;
      if (!ids || ids.size === 0) return false;
      return ids.has(conversation.id);
    }
    default:
      return false;
  }
}
