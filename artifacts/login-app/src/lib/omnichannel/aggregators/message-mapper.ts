import type { ConversationMessageRecord } from "@workspace/ai-conversation";
import type {
  OmnichannelChannelKey,
  UnifiedMessage,
  UnifiedMessageAttachment,
} from "@/lib/omnichannel/types/unified-conversation";
import { messageTypeToSenderType } from "@/lib/omnichannel/types/unified-conversation";

function readMetadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function buildAttachments(message: ConversationMessageRecord): UnifiedMessageAttachment[] {
  if (!message.attachment_url && !message.attachment_type) return [];
  return [
    {
      type: message.attachment_type ?? "file",
      url: message.attachment_url,
      mimeType: message.mime_type,
      fileSize: message.file_size,
    },
  ];
}

export function mapUnifiedMessage(
  message: ConversationMessageRecord,
  channel: OmnichannelChannelKey,
  senderLabels: Partial<Record<UnifiedMessage["senderType"], string>> = {},
): UnifiedMessage {
  const senderType = messageTypeToSenderType(message.message_type);
  const defaultLabels: Record<UnifiedMessage["senderType"], string> = {
    customer: "Customer",
    agent: "Agent",
    assistant: "AI Employee",
    system: "System",
    automation: "Automation",
  };

  return {
    id: message.id,
    conversationId: message.conversation_id,
    channel,
    senderType,
    senderLabel: senderLabels[senderType] ?? defaultLabels[senderType],
    timestamp: message.created_at,
    body: message.content,
    deliveryStatus: message.status,
    contentType: message.content_type,
    attachments: buildAttachments(message),
    aiActionLabel: readMetadataString(message.metadata, "ai_action_label"),
    automationActionLabel: readMetadataString(message.metadata, "automation_action_label"),
    isInternalNote: message.message_type === "internal_note",
    source: message,
  };
}

export function mapUnifiedMessages(
  messages: ConversationMessageRecord[],
  channel: OmnichannelChannelKey,
): UnifiedMessage[] {
  return [...messages]
    .sort((left, right) => left.sequence_number - right.sequence_number)
    .map((message) => mapUnifiedMessage(message, channel));
}

export function mergeUnifiedMessagesAcrossChannels(
  bundles: Array<{ channel: OmnichannelChannelKey; messages: ConversationMessageRecord[] }>,
): UnifiedMessage[] {
  return bundles
    .flatMap((bundle) => mapUnifiedMessages(bundle.messages, bundle.channel))
    .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
}
