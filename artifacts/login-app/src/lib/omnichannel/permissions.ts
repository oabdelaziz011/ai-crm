import { CONVERSATION_PERMISSIONS } from "@workspace/ai-conversation";
import { traceReorderStage } from "@/lib/omnichannel/debug/omni-reorder-audit";

export const OMNICHANNEL_PERMISSIONS = {
  view: CONVERSATION_PERMISSIONS.view,
  reply: CONVERSATION_PERMISSIONS.reply,
  takeover: CONVERSATION_PERMISSIONS.takeover,
  release: CONVERSATION_PERMISSIONS.release,
  channelsView: "channels.view",
  customersView: "customers.view",
  knowledgeView: "knowledge.view",
  aiExecutionView: "ai.execution.view",
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

export function filterConversationsByOwnership<T extends { assignedAgent?: { id: string } | null }>(
  conversations: T[],
  access: OmnichannelAccess,
  mineOnly: boolean,
): T[] {
  if (!mineOnly) return conversations;
  return conversations.filter((item) => item.assignedAgent?.id === access.userId);
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
