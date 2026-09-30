import { isPublicWebChatConversation } from "@/lib/omnichannel/services/public-web-chat-conversation";

/**
 * Public Web Chat has no push provider: the visitor widget polls
 * web_chat_public_list_messages. A staff reply is "sent" once it is persisted and
 * confirmed; it is never reported as delivered/read.
 */
export const PUBLIC_WEB_CHAT_DELIVERY_MODE = "visitor_polling" as const;

type QueryResult<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;

export type PublicWebChatReplyClient = {
  from: (table: "conversations") => {
    select: (columns: string) => {
      eq: (column: "id", value: string) => {
        maybeSingle: () => QueryResult<{
          id: string;
          company_id: string;
          channel_type: string | null;
          metadata: unknown;
        }>;
      };
    };
  };
  rpc: (
    fn: "confirm_conversation_message_outbound",
    args: { p_message_id: string; p_status: "sent"; p_external_message_id: null },
  ) => QueryResult<unknown>;
};

export type PublicWebChatReplyPlan =
  | { kind: "public_web_chat" }
  | { kind: "not_public_web_chat" }
  | { kind: "rejected"; message: string };

/**
 * Classifies the conversation from the staff-RLS-visible row (never from caller hints).
 * Company mismatch or an invisible row is rejected — RLS already hides other tenants.
 */
export async function resolvePublicWebChatReplyPlan(
  client: PublicWebChatReplyClient,
  input: {
    conversationId: string;
    companyId: string;
    hasAttachments: boolean;
    canViewPublicWebChat: boolean;
  },
): Promise<PublicWebChatReplyPlan> {
  const { data, error } = await client
    .from("conversations")
    .select("id, company_id, channel_type, metadata")
    .eq("id", input.conversationId)
    .maybeSingle();
  if (error) return { kind: "rejected", message: error.message };
  if (!data || data.company_id !== input.companyId) {
    return { kind: "rejected", message: "Conversation is not available." };
  }
  if (!isPublicWebChatConversation(data)) return { kind: "not_public_web_chat" };
  if (!input.canViewPublicWebChat) {
    return { kind: "rejected", message: "Web Chat access is required to reply." };
  }
  if (input.hasAttachments) {
    // Visitor poll returns text only — do not accept attachments it cannot show.
    return { kind: "rejected", message: "Attachments are not supported for Live Chat yet." };
  }
  return { kind: "public_web_chat" };
}

/** Confirms a persisted staff reply for visitor polling — no provider call. */
export async function confirmPublicWebChatVisitorPollingReply(
  client: PublicWebChatReplyClient,
  messageId: string,
): Promise<{ deliveryStatus: "sent"; externalMessageId?: undefined; deliveryMode: typeof PUBLIC_WEB_CHAT_DELIVERY_MODE }> {
  const { error } = await client.rpc("confirm_conversation_message_outbound", {
    p_message_id: messageId,
    p_status: "sent",
    p_external_message_id: null,
  });
  if (error) throw new Error(error.message);
  return { deliveryStatus: "sent", deliveryMode: PUBLIC_WEB_CHAT_DELIVERY_MODE };
}
