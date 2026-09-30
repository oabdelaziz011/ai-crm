/**
 * Load channel-session / conversation / inbound / customer hints and build
 * adapter metadata required for Close & Notify outbound (esp. Email recipientEmail).
 */

import { supabase } from "@/lib/supabase";
import type { TicketOriginChannel } from "@/lib/tickets/ticket-origin-channel";
import {
  resolveCloseNotifyEmailRecipient,
  resolveCloseNotifySmsThreadId,
  resolveCloseNotifySubject,
} from "@/lib/tickets/ticket-close-notify-recipient";

export type TicketCloseNotifyOutboundEnrichment = {
  metadata: Record<string, unknown>;
  /** Only set for SMS when sender_external_id repairs a bad thread id. */
  externalThreadId?: string;
};

export async function enrichTicketCloseNotifyOutbound(input: {
  companyId: string;
  conversationId: string;
  channelSessionId: string;
  channelKey: TicketOriginChannel;
  ticketId: string;
  ticketNumber: string;
  baseMetadata: Record<string, unknown>;
  sessionExternalThreadId: string;
}): Promise<
  | { ok: true; enrichment: TicketCloseNotifyOutboundEnrichment }
  | { ok: false; message: string }
> {
  const [{ data: sessionRow }, { data: conversation }, { data: inbound }, { data: ticket }] =
    await Promise.all([
      supabase
        .from("channel_sessions")
        .select("sender_external_id, external_thread_id, metadata")
        .eq("id", input.channelSessionId)
        .eq("company_id", input.companyId)
        .maybeSingle(),
      supabase
        .from("conversations")
        .select("metadata")
        .eq("id", input.conversationId)
        .eq("company_id", input.companyId)
        .maybeSingle(),
      supabase
        .from("conversation_messages")
        .select("metadata, external_message_id")
        .eq("conversation_id", input.conversationId)
        .eq("message_type", "incoming")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("support_tickets")
        .select("customer_id")
        .eq("id", input.ticketId)
        .eq("company_id", input.companyId)
        .maybeSingle(),
    ]);

  let customerEmail: string | null = null;
  const customerId = typeof ticket?.customer_id === "string" ? ticket.customer_id : null;
  if (customerId) {
    const { data: customer } = await supabase
      .from("customers")
      .select("email")
      .eq("id", customerId)
      .eq("company_id", input.companyId)
      .maybeSingle();
    customerEmail = typeof customer?.email === "string" ? customer.email : null;
  }

  const conversationMetadata =
    conversation?.metadata && typeof conversation.metadata === "object"
      ? (conversation.metadata as Record<string, unknown>)
      : null;
  const inboundMessageMetadata =
    inbound?.metadata && typeof inbound.metadata === "object"
      ? (inbound.metadata as Record<string, unknown>)
      : null;
  const sessionSenderExternalId =
    typeof sessionRow?.sender_external_id === "string" ? sessionRow.sender_external_id : null;

  const metadata: Record<string, unknown> = { ...input.baseMetadata };

  if (input.channelKey === "email") {
    const recipientEmail = resolveCloseNotifyEmailRecipient({
      sessionSenderExternalId,
      conversationMetadata,
      inboundMessageMetadata,
      customerEmail,
    });
    if (!recipientEmail) {
      return {
        ok: false,
        message:
          "Could not resolve the customer email address for this ticket channel session.",
      };
    }
    metadata.recipientEmail = recipientEmail;
    metadata.senderExternalId = recipientEmail;
    metadata.subject = resolveCloseNotifySubject({
      conversationMetadata,
      inboundMessageMetadata,
      ticketNumber: input.ticketNumber,
    });
    const inboundMessageId =
      typeof inbound?.external_message_id === "string" && inbound.external_message_id.trim()
        ? inbound.external_message_id.trim()
        : null;
    if (inboundMessageId) {
      metadata.inReplyTo = inboundMessageId;
    }
    return { ok: true, enrichment: { metadata } };
  }

  if (input.channelKey === "sms") {
    const externalThreadId = resolveCloseNotifySmsThreadId({
      sessionExternalThreadId: input.sessionExternalThreadId,
      sessionSenderExternalId,
    });
    return {
      ok: true,
      enrichment: {
        metadata,
        externalThreadId:
          externalThreadId !== input.sessionExternalThreadId.trim()
            ? externalThreadId
            : undefined,
      },
    };
  }

  // WhatsApp / Messenger / Instagram: recipient is session external_thread_id (PSID / WA id).
  // Do not inject CRM phone overrides.
  return { ok: true, enrichment: { metadata } };
}
