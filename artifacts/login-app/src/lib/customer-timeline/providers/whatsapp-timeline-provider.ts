import { parseConversationMessageView } from "@workspace/ai-conversation";
import { supabase } from "@/lib/supabase";
import type { TimelineEvent, TimelineEventProvider, TimelineFetchInput } from "../types";
import {
  fetchActorNames,
  fetchCustomerConversationIds,
  fetchCustomerDisplayName,
  truncateText,
} from "../provider-utils";

type MessageRow = {
  id: string;
  conversation_id: string;
  message_type: string;
  content_type: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
  created_by: string | null;
};

function resolveWhatsappEventType(message: MessageRow): TimelineEvent["type"] | null {
  if (message.message_type === "system") return null;

  const view = parseConversationMessageView({
    id: message.id,
    conversation_id: message.conversation_id,
    participant_id: null,
    sequence_number: 0,
    message_type: message.message_type as "incoming" | "outgoing" | "system" | "internal_note",
    content_type: message.content_type as "text",
    content: message.content,
    metadata: message.metadata ?? {},
    status: "sent",
    external_message_id: null,
    attachment_type: null,
    attachment_url: null,
    mime_type: null,
    file_size: null,
    search_text: "",
    created_at: message.created_at,
    created_by: message.created_by,
  });

  if (view.kind === "template") return "template_sent";
  if (view.kind === "interactive_reply") return "interactive_reply";
  if (message.content_type === "template") return "template_sent";

  if (message.message_type === "incoming") return "whatsapp_message_received";
  if (message.message_type === "outgoing") return "whatsapp_message_sent";
  return null;
}

function messageDetail(message: MessageRow): string | null {
  const view = parseConversationMessageView({
    id: message.id,
    conversation_id: message.conversation_id,
    participant_id: null,
    sequence_number: 0,
    message_type: message.message_type as "incoming" | "outgoing" | "system" | "internal_note",
    content_type: message.content_type as "text",
    content: message.content,
    metadata: message.metadata ?? {},
    status: "sent",
    external_message_id: null,
    attachment_type: null,
    attachment_url: null,
    mime_type: null,
    file_size: null,
    search_text: "",
    created_at: message.created_at,
    created_by: message.created_by,
  });

  if (view.kind === "text") return truncateText(view.text);
  if (view.kind === "template") return truncateText(view.templateKey);
  if (view.kind === "interactive_reply") return truncateText(view.title ?? view.replyId);
  if (view.kind === "media") return truncateText(view.caption ?? view.url);
  return truncateText(message.content);
}

export class WhatsappTimelineProvider implements TimelineEventProvider {
  readonly providerId = "whatsapp";

  async getEvents({ customerId, companyId }: TimelineFetchInput): Promise<TimelineEvent[]> {
    if (!companyId) return [];
    const conversationIds = await fetchCustomerConversationIds(customerId, "whatsapp", companyId);
    if (conversationIds.length === 0) return [];

    const { data, error } = await supabase
      .from("conversation_messages")
      .select(
        "id, conversation_id, message_type, content_type, content, metadata, created_at, created_by",
      )
      .in("conversation_id", conversationIds)
      .neq("message_type", "internal_note")
      .order("created_at", { ascending: false })
      .limit(250);

    if (error || !data) return [];

    const messages = data as MessageRow[];
    const customerName = await fetchCustomerDisplayName(customerId);
    const actorNames = await fetchActorNames(messages.map((message) => message.created_by ?? ""));

    return messages.flatMap((message) => {
      const type = resolveWhatsappEventType(message);
      if (!type) return [];

      const detail = messageDetail(message);
      const isIncoming = message.message_type === "incoming";
      const actor = isIncoming
        ? customerName
        : message.created_by
          ? actorNames.get(message.created_by) ?? null
          : null;

      return [
        {
          id: `${this.providerId}:${type}:${message.id}`,
          type,
          occurredAt: message.created_at,
          source: this.providerId,
          payload: {
            messageId: message.id,
            conversationId: message.conversation_id,
            contentType: message.content_type,
          },
          metadata: {
            actor,
            actorId: isIncoming ? customerId : message.created_by,
            detail,
            searchText: [type, detail, actor].filter(Boolean).join(" "),
            filterGroup: "messages",
          },
        } satisfies TimelineEvent,
      ];
    });
  }
}
