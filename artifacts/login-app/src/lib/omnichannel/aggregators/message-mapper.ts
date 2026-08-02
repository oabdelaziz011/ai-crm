import type { ConversationMessageRecord } from "@workspace/ai-conversation";
import type { Profile } from "@/lib/types";
import { resolveAgentDisplayNameFromProfile } from "@/lib/omnichannel/presentation/agent-display-name";
import type {
  OmnichannelChannelKey,
  UnifiedMessage,
  UnifiedMessageAttachment,
} from "@/lib/omnichannel/types/unified-conversation";
import { messageTypeToSenderType } from "@/lib/omnichannel/types/unified-conversation";
import { resolveOutboundDeliveryPhase } from "@/lib/omnichannel/services/outbound-delivery";

function readMetadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readMetadataAttachments(metadata: Record<string, unknown>): UnifiedMessageAttachment[] {
  const raw = metadata.attachments;
  if (!Array.isArray(raw)) return [];
  const results: UnifiedMessageAttachment[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const url = typeof record.url === "string" ? record.url : null;
    if (!url) continue;
    results.push({
      type: typeof record.type === "string" ? record.type : "file",
      url,
      mimeType: typeof record.mimeType === "string" ? record.mimeType : null,
      fileSize: typeof record.fileSize === "number" ? record.fileSize : null,
      name: typeof record.name === "string" ? record.name : null,
    });
  }
  return results;
}

function buildAttachments(message: ConversationMessageRecord): UnifiedMessageAttachment[] {
  const metadata = (message.metadata ?? {}) as Record<string, unknown>;
  const fromMetadata = readMetadataAttachments(metadata);
  if (fromMetadata.length > 0) return fromMetadata;
  if (!message.attachment_url && !message.attachment_type) return [];
  return [
    {
      type: message.attachment_type ?? "file",
      url: message.attachment_url,
      mimeType: message.mime_type,
      fileSize: message.file_size,
      name: null,
    },
  ];
}

function resolveAgentLabel(
  message: ConversationMessageRecord,
  senderLabels: Partial<Record<UnifiedMessage["senderType"], string>>,
  profilesByUserId?: ReadonlyMap<string, Profile>,
  fallback = "Support Agent",
): string {
  const metadataAuthor =
    readMetadataString(message.metadata, "authorName")
    ?? readMetadataString(message.metadata, "agentName")
    ?? readMetadataString(message.metadata, "sender_name");

  const agentUserId = readMetadataString(message.metadata, "agentUserId");
  const profile = agentUserId
    ? [...(profilesByUserId?.values() ?? [])].find((entry) => entry.id === agentUserId || entry.user_id === agentUserId)
    : undefined;

  return resolveAgentDisplayNameFromProfile(profile, metadataAuthor ?? senderLabels.agent, fallback).display;
}

export function mapUnifiedMessage(
  message: ConversationMessageRecord,
  channel: OmnichannelChannelKey,
  senderLabels: Partial<Record<UnifiedMessage["senderType"], string>> = {},
  profilesByUserId?: ReadonlyMap<string, Profile>,
  supportAgentFallback = "Support Agent",
): UnifiedMessage {
  const senderType = messageTypeToSenderType(message.message_type);
  const defaultLabels: Record<UnifiedMessage["senderType"], string> = {
    customer: senderLabels.customer ?? "Customer",
    agent: senderLabels.agent ?? supportAgentFallback,
    assistant: senderLabels.assistant ?? "AI Employee",
    system: "System",
    automation: "Automation",
  };

  const resolvedAgentLabel =
    senderType === "agent" || message.message_type === "internal_note"
      ? resolveAgentLabel(message, senderLabels, profilesByUserId, supportAgentFallback)
      : defaultLabels[senderType];

  return {
    id: message.id,
    conversationId: message.conversation_id,
    channel,
    senderType,
    senderLabel: senderType === "customer" ? defaultLabels.customer : resolvedAgentLabel,
    timestamp: message.created_at,
    body: message.content,
    deliveryStatus: message.status,
    outboundPhase: resolveOutboundDeliveryPhase(message),
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
  senderLabels: Partial<Record<UnifiedMessage["senderType"], string>> = {},
  profilesByUserId?: ReadonlyMap<string, Profile>,
  supportAgentFallback = "Support Agent",
): UnifiedMessage[] {
  return [...messages]
    .sort((left, right) => left.sequence_number - right.sequence_number)
    .map((message) => mapUnifiedMessage(message, channel, senderLabels, profilesByUserId, supportAgentFallback));
}

export function mergeUnifiedMessagesAcrossChannels(
  bundles: Array<{ channel: OmnichannelChannelKey; messages: ConversationMessageRecord[] }>,
): UnifiedMessage[] {
  return bundles
    .flatMap((bundle) => mapUnifiedMessages(bundle.messages, bundle.channel))
    .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
}
