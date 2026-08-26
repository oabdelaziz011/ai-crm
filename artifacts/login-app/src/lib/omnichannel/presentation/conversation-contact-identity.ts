import type { ConversationRecord } from "@workspace/ai-conversation";
import type {
  OmnichannelChannelKey,
  OmnichannelCustomerRef,
  UnifiedConversation,
} from "@/lib/omnichannel/types/unified-conversation";

export type ConversationContactIdentity = {
  fullName: string | null;
  businessName: string | null;
  phone: string | null;
  email: string | null;
  channelUsername: string | null;
};

function readMetadataString(metadata: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function extractContactIdentityFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Omit<ConversationContactIdentity, "fullName"> {
  const source = metadata ?? {};
  return {
    businessName: readMetadataString(
      source,
      "businessName",
      "business_name",
      "companyName",
      "company_name",
    ),
    // WhatsApp unknown senders store the sender under senderExternalId / externalThreadId.
    phone: readMetadataString(
      source,
      "phone",
      "phoneNumber",
      "phone_number",
      "wa_id",
      "senderExternalId",
      "sender_external_id",
      "externalThreadId",
      "external_thread_id",
    ),
    email: readMetadataString(source, "email", "senderEmail", "sender_email"),
    channelUsername: readMetadataString(
      source,
      "channelUsername",
      "channel_username",
      "username",
      "senderName",
      "sender_name",
      "instagramUsername",
      "instagram_username",
      "messengerName",
      "messenger_name",
      "messengerUsername",
      "whatsappName",
      "whatsapp_name",
      "wa_profile_name",
      "telegramUsername",
    ),
  };
}

export function formatChannelUsername(channel: OmnichannelChannelKey | string, username: string): string {
  const trimmed = username.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("@") || trimmed.startsWith("+") || trimmed.includes("@")) return trimmed;
  if (channel === "instagram" || channel === "telegram") return `@${trimmed}`;
  if (channel === "whatsapp") return `wa.me/${trimmed.replace(/\s/g, "")}`;
  return trimmed;
}

export function extractContactIdentityFromRecord(
  record: ConversationRecord,
): ConversationContactIdentity {
  const fromMetadata = extractContactIdentityFromMetadata(record.metadata);
  return {
    fullName: null,
    ...fromMetadata,
  };
}

export function buildEnrichedCustomerRef(
  conversation: UnifiedConversation | null,
): OmnichannelCustomerRef | null {
  if (!conversation) return null;

  const linked = conversation.customer;
  const metadataIdentity = extractContactIdentityFromMetadata(conversation.source.metadata);

  if (!linked?.id && !metadataIdentity.phone && !metadataIdentity.email && !metadataIdentity.channelUsername) {
    return linked;
  }

  return {
    id: linked?.id ?? conversation.source.customer_id ?? "",
    name: linked?.name?.trim() ?? "",
    phone: linked?.phone?.trim() ?? metadataIdentity.phone,
    email: linked?.email?.trim() ?? metadataIdentity.email,
  };
}

export function buildContactDisplayInput(
  conversation: UnifiedConversation | null,
  headerCustomer: { name: string; phone: string | null; email: string | null } | null | undefined,
  visitorLabel: string,
) {
  const metadataIdentity = conversation
    ? extractContactIdentityFromMetadata(conversation.source.metadata)
    : {
        businessName: null,
        phone: null,
        email: null,
        channelUsername: null,
      };

  const channelPhone =
    metadataIdentity.phone?.trim() ||
    conversation?.externalThreadId?.trim() ||
    null;

  return {
    name: headerCustomer?.name ?? conversation?.customer?.name ?? null,
    businessName: metadataIdentity.businessName,
    phone: headerCustomer?.phone ?? conversation?.customer?.phone ?? null,
    email: headerCustomer?.email ?? conversation?.customer?.email ?? null,
    channelUsername: metadataIdentity.channelUsername,
    channel: conversation?.channel ?? null,
    conversationId: conversation?.id ?? null,
    metadataPhone: channelPhone,
    visitorLabel,
  };
}
