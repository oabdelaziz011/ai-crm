import { CONVERSATION_PERMISSIONS } from "@workspace/ai-conversation";
import { traceReorderStage } from "@/lib/omnichannel/debug/omni-reorder-audit";
import { resolveAssignedToUserId } from "@/lib/omnichannel/presentation/conversation-ownership";
import { isPublicWebChatConversation } from "@/lib/omnichannel/services/public-web-chat-conversation";
import {
  OMNICHANNEL_PRIMARY_CHANNELS,
  OMNICHANNEL_PUBLIC_WEB_CHAT_CHANNEL,
  type OmnichannelChannelKey,
  type UnifiedConversation,
} from "@/lib/omnichannel/types/unified-conversation";

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
  /** Public Web Chat (Live Chat) visibility — existing Web Presence codes, no new codes. */
  webPresenceView: "web_presence.view",
  webPresenceManage: "web_presence.manage",
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

/**
 * Public Web Chat needs its own grant — seeing WhatsApp/SMS/etc. never implies it.
 * Assignment/department scoping still applies on top (RLS + ownership filters).
 */
export function canViewPublicWebChatInbox(access: OmnichannelAccess | null | undefined): boolean {
  if (!canViewOmnichannelConsole(access)) return false;
  if (access!.isSuperAdmin) return true;
  return (
    access!.hasPermission(OMNICHANNEL_PERMISSIONS.webPresenceView)
    || access!.hasPermission(OMNICHANNEL_PERMISSIONS.webPresenceManage)
  );
}

const OMNICHANNEL_INBOX_CHANNELS_WITH_WEB_CHAT: readonly OmnichannelChannelKey[] = [
  ...OMNICHANNEL_PRIMARY_CHANNELS,
  OMNICHANNEL_PUBLIC_WEB_CHAT_CHANNEL,
];

export function resolveOmnichannelInboxChannels(
  access: OmnichannelAccess | null | undefined,
): readonly OmnichannelChannelKey[] {
  return canViewPublicWebChatInbox(access)
    ? OMNICHANNEL_INBOX_CHANNELS_WITH_WEB_CHAT
    : OMNICHANNEL_PRIMARY_CHANNELS;
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

export function filterConversationsByChannelPermission<
  T extends { channel: string; id: string; source?: { metadata?: unknown } | null },
>(
  conversations: T[],
  allowedChannels: readonly string[],
): T[] {
  const allowed = new Set(allowedChannels);
  const result = conversations.filter(
    (item) =>
      allowed.has(item.channel)
      && (item.channel !== OMNICHANNEL_PUBLIC_WEB_CHAT_CHANNEL || isPublicWebChatConversation(item)),
  );
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
