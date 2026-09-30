import { WEB_WIDGET_CHANNEL_PROVIDER } from "@/lib/channels/internal-web-chat-channel";

type ConversationLike = {
  channel?: string | null;
  channel_type?: string | null;
  metadata?: unknown;
  source?: { channel_type?: string | null; metadata?: unknown } | null;
};

function readMetadata(conversation: ConversationLike): Record<string, unknown> {
  const raw = conversation.metadata ?? conversation.source?.metadata;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function readChannel(conversation: ConversationLike): string | null {
  return conversation.channel ?? conversation.channel_type ?? conversation.source?.channel_type ?? null;
}

/**
 * Public website widget conversation (provider valueor.web_widget), stamped server-side by
 * web_chat_public_ensure_conversation. Internal AI chat also uses channel_type web_chat
 * (generic.web_chat) and must never match.
 */
export function isPublicWebChatConversation(conversation: ConversationLike): boolean {
  if (readChannel(conversation) !== "web_chat") return false;
  const metadata = readMetadata(conversation);
  return metadata.publicWebChat === true && metadata.channelProvider === WEB_WIDGET_CHANNEL_PROVIDER;
}

export function isInternalAiWebChatConversation(conversation: ConversationLike): boolean {
  return readChannel(conversation) === "web_chat" && !isPublicWebChatConversation(conversation);
}
