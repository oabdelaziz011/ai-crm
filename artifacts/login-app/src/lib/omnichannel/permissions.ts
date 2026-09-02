import { CONVERSATION_PERMISSIONS } from "@workspace/ai-conversation";
import { traceReorderStage } from "@/lib/omnichannel/debug/omni-reorder-audit";
import { resolveAssignedToUserId } from "@/lib/omnichannel/presentation/conversation-ownership";
import type { UnifiedConversation } from "@/lib/omnichannel/types/unified-conversation";

export const OMNICHANNEL_PERMISSIONS = {
  view: CONVERSATION_PERMISSIONS.view,
  reply: CONVERSATION_PERMISSIONS.reply,
  takeover: CONVERSATION_PERMISSIONS.takeover,
  release: CONVERSATION_PERMISSIONS.release,
  channelsView: "channels.view",
  customersView: "customers.view",
  knowledgeView: "knowledge.view",
  aiExecutionView: "ai.execution.view",
  /** Company Admin routing/config — not granted to Human Handoff Agent. */
  handoffManage: "handoff.manage",
  usersView: "users.view",
} as const;

export type OmnichannelAccess = {
  userId: string;
  companyId: string;
  isSuperAdmin: boolean;
  hasPermission: (permission: string) => boolean;
};

export function canViewOmnichannelConsole(access: OmnichannelAccess | null | undefined): boolean {
  if (!access) return false;
  return access.isSuperAdmin || access.hasPermission(OMNICHANNEL_PERMISSIONS.view);
}

/**
 * Full-tenant inbox (all owners). Super Admin / Company Admin only.
 * Desk agents (e.g. human_handoff_agent) must only see conversations they own.
 */
export function canViewAllOmnichannelConversations(
  access: OmnichannelAccess | null | undefined,
): boolean {
  if (!access) return false;
  if (access.isSuperAdmin) return true;
  return (
    access.hasPermission(OMNICHANNEL_PERMISSIONS.handoffManage)
    || access.hasPermission(OMNICHANNEL_PERMISSIONS.usersView)
  );
}

export function canReplyToConversation(access: OmnichannelAccess | null | undefined): boolean {
  if (!access) return false;
  return access.isSuperAdmin || access.hasPermission(OMNICHANNEL_PERMISSIONS.reply);
}

export function canAssignConversation(
  access: OmnichannelAccess | null | undefined,
  assignedUserId?: string | null,
): boolean {
  if (!access) return false;
  if (access.isSuperAdmin || access.hasPermission(OMNICHANNEL_PERMISSIONS.takeover)) return true;
  return assignedUserId != null && assignedUserId === access.userId;
}

export function filterConversationsByOwnership(
  conversations: UnifiedConversation[],
  access: OmnichannelAccess,
  mineOnly: boolean,
): UnifiedConversation[] {
  if (!mineOnly) return conversations;
  return conversations.filter((item) => resolveAssignedToUserId(item) === access.userId);
}

export function filterConversationsByChannelPermission<T extends { channel: string; id: string }>(
  conversations: T[],
  allowedChannels: readonly string[],
): T[] {
  const allowed = new Set(allowedChannels);
  const result = conversations.filter((item) => allowed.has(item.channel));
  traceReorderStage({
    stage: "filterConversationsByChannelPermission",
    file: "permissions.ts",
    function: "filterConversationsByChannelPermission",
    line: 54,
    before: conversations,
    after: result,
    arrayReferenceChanged: true,
    sortCalled: false,
    extra: { allowedChannels: [...allowedChannels] },
  });
  return result;
}
