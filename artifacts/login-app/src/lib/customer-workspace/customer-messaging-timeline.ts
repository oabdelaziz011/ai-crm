/**
 * Customer 360 messaging history (WhatsApp / Messenger / Instagram).
 * Linkage is conversations.customer_id only — never rematch phone/PSID on read.
 */
import type {
  ConversationRecord,
  ConversationService,
  ServiceContext,
} from "@workspace/ai-conversation";

export const CUSTOMER_MESSAGING_PAGE_SIZE = 20;

export const CUSTOMER_MESSAGING_CHANNEL_TYPES = [
  "whatsapp",
  "messenger",
  "instagram",
] as const;

export type CustomerMessagingChannelType =
  (typeof CUSTOMER_MESSAGING_CHANNEL_TYPES)[number];

export function customerMessagingConversationsQueryKey(
  companyId: string | null,
  customerId: string | null,
) {
  return [
    "conversation-list",
    companyId,
    { channelTypes: CUSTOMER_MESSAGING_CHANNEL_TYPES, customerId },
  ] as const;
}

export function customerMessagingOpenConversationHref(
  channelType: string,
  conversationId: string,
): string {
  const id = conversationId.trim();
  if (channelType === "whatsapp") {
    return `~/dashboard/whatsapp?conversation=${encodeURIComponent(id)}`;
  }
  return `~/dashboard/omnichannel?conversation=${encodeURIComponent(id)}`;
}

export function isCustomerLinkedMessagingConversation(input: {
  conversation: Pick<ConversationRecord, "company_id" | "channel_type" | "customer_id">;
  companyId: string;
  customerId: string;
}): boolean {
  if (input.conversation.company_id !== input.companyId) return false;
  if (
    !CUSTOMER_MESSAGING_CHANNEL_TYPES.includes(
      input.conversation.channel_type as CustomerMessagingChannelType,
    )
  ) {
    return false;
  }
  return input.conversation.customer_id === input.customerId;
}

export async function listCustomerMessagingConversations(input: {
  ctx: ServiceContext;
  conversations: ConversationService;
  companyId: string;
  customerId: string;
  limit?: number;
  offset?: number;
}): Promise<ConversationRecord[]> {
  const companyId = input.companyId.trim();
  const customerId = input.customerId.trim();
  if (!companyId || !customerId) return [];

  const rows = await input.conversations.listConversations(input.ctx, {
    companyId,
    channelTypes: [...CUSTOMER_MESSAGING_CHANNEL_TYPES],
    customerId,
    limit: input.limit ?? CUSTOMER_MESSAGING_PAGE_SIZE,
    offset: input.offset ?? 0,
  });

  return rows.filter((conversation) =>
    isCustomerLinkedMessagingConversation({
      conversation,
      companyId,
      customerId,
    }),
  );
}
