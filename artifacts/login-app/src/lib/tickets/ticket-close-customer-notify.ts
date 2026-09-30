/**
 * Send a ticket-resolved notice on the SAME channel that opened the ticket.
 * Reuses omnichannel outbound (email / WhatsApp / Messenger / Instagram / SMS).
 * Never falls back to a different channel.
 */

import type { ChannelDispatcher, ServiceContext } from "@workspace/channel-platform/client";
import { resolveChannelSession } from "@/lib/omnichannel/services/channel-session-resolver";
import { dispatchOutboundMessage } from "@/lib/omnichannel/services/outbound-dispatch-service";
import {
  validateOutboundRoute,
  type OutboundRouteTarget,
} from "@/lib/omnichannel/services/outbound-delivery";
import { isWithinMessagingResponseWindow } from "@/lib/campaigns/thread-eligibility";
import {
  hasTicketCloseCustomerNotified,
  normalizeTicketOriginChannel,
  TICKET_CLOSE_NOTIFY_META,
  type TicketOriginChannel,
} from "@/lib/tickets/ticket-origin-channel";
import { enrichTicketCloseNotifyOutbound } from "@/lib/tickets/ticket-close-notify-enrich";
import { supabase } from "@/lib/supabase";

export type TicketCloseCustomerNotifyInput = {
  companyId: string;
  ticketId: string;
  conversationId: string | null | undefined;
  originChannel: string | null | undefined;
  messageBody: string;
  ticketNumber: string;
  /** Optional last inbound activity for Meta messaging window checks. */
  lastCustomerActivityAt?: string | null;
  channelContext: ServiceContext;
  dispatcher: ChannelDispatcher;
  /** Client-generated key to prevent duplicate sends on double-click / retry. */
  idempotencyKey?: string;
};

export type TicketCloseCustomerNotifyResult =
  | {
      ok: true;
      channelKey: TicketOriginChannel;
      deliveryStatus: string | null;
      externalMessageId: string | null;
      alreadyNotified: boolean;
    }
  | {
      ok: false;
      reason:
        | "no_conversation"
        | "no_channel_session"
        | "route_invalid"
        | "empty_message"
        | "dispatch_failed"
        | "messaging_window_closed"
        | "already_notified";
      message: string;
    };

const META_CHANNELS = new Set(["whatsapp", "messenger", "instagram"]);

export async function notifyTicketResolvedOnOriginChannel(
  input: TicketCloseCustomerNotifyInput,
): Promise<TicketCloseCustomerNotifyResult> {
  const body = input.messageBody.trim();
  if (!body) {
    return { ok: false, reason: "empty_message", message: "Resolution message is empty." };
  }

  const ticketId = String(input.ticketId ?? "").trim();
  if (ticketId) {
    const { data: existingRow } = await supabase
      .from("support_tickets")
      .select("metadata")
      .eq("id", ticketId)
      .eq("company_id", input.companyId)
      .maybeSingle();
    const metadata = (existingRow?.metadata ?? null) as Record<string, unknown> | null;
    if (hasTicketCloseCustomerNotified(metadata)) {
      const channel =
        normalizeTicketOriginChannel(metadata?.[TICKET_CLOSE_NOTIFY_META.channel]) ||
        normalizeTicketOriginChannel(input.originChannel) ||
        "email";
      return {
        ok: true,
        channelKey: channel,
        deliveryStatus: "already_notified",
        externalMessageId:
          typeof metadata?.[TICKET_CLOSE_NOTIFY_META.messageId] === "string"
            ? String(metadata[TICKET_CLOSE_NOTIFY_META.messageId])
            : null,
        alreadyNotified: true,
      };
    }
    if (
      input.idempotencyKey &&
      metadata?.[TICKET_CLOSE_NOTIFY_META.idempotencyKey] === input.idempotencyKey
    ) {
      const channel =
        normalizeTicketOriginChannel(metadata?.[TICKET_CLOSE_NOTIFY_META.channel]) ||
        normalizeTicketOriginChannel(input.originChannel) ||
        "email";
      return {
        ok: true,
        channelKey: channel,
        deliveryStatus: "already_notified",
        externalMessageId: null,
        alreadyNotified: true,
      };
    }
  }

  const conversationId = String(input.conversationId ?? "").trim();
  if (!conversationId) {
    return {
      ok: false,
      reason: "no_conversation",
      message: "This ticket is not linked to a customer conversation channel.",
    };
  }

  const session = await resolveChannelSession(conversationId);
  if (!session?.id || !session.company_channel_id || !session.external_thread_id) {
    return {
      ok: false,
      reason: "no_channel_session",
      message: "Could not resolve the customer channel session for this ticket.",
    };
  }

  // Session channel_key is authoritative for send — never invent another channel.
  const channelKey =
    normalizeTicketOriginChannel(session.channel_key) ||
    normalizeTicketOriginChannel(input.originChannel);
  if (!channelKey) {
    return {
      ok: false,
      reason: "route_invalid",
      message: "Unsupported or missing ticket origin channel.",
    };
  }

  if (META_CHANNELS.has(channelKey) && input.lastCustomerActivityAt) {
    if (!isWithinMessagingResponseWindow(input.lastCustomerActivityAt)) {
      return {
        ok: false,
        reason: "messaging_window_closed",
        message:
          "The messaging response window for this conversation has expired. Close without notification, or wait for the customer to message again.",
      };
    }
  }

  const target: OutboundRouteTarget = {
    conversationId,
    companyChannelId: session.company_channel_id,
    channelKey,
    externalThreadId: session.external_thread_id,
  };

  const validation = validateOutboundRoute(session, target);
  if (!validation.ok) {
    return {
      ok: false,
      reason: "route_invalid",
      message: validation.issue?.message || "Outbound route is not available for this channel.",
    };
  }

  const enriched = await enrichTicketCloseNotifyOutbound({
    companyId: input.companyId,
    conversationId,
    channelSessionId: session.id,
    channelKey,
    ticketId,
    ticketNumber: input.ticketNumber,
    sessionExternalThreadId: session.external_thread_id,
    baseMetadata: {
      source: "ticket_close_customer_notify",
      ticketNumber: input.ticketNumber,
      ticketId: input.ticketId,
      idempotencyKey: input.idempotencyKey ?? null,
    },
  });
  if (!enriched.ok) {
    return {
      ok: false,
      reason: "route_invalid",
      message: enriched.message,
    };
  }

  const outboundExternalThreadId =
    enriched.enrichment.externalThreadId ?? session.external_thread_id;

  try {
    const result = await dispatchOutboundMessage(channelKey, input.channelContext, input.dispatcher, {
      companyId: input.companyId,
      companyChannelId: session.company_channel_id,
      channelKey,
      conversationId,
      channelSessionId: session.id,
      externalThreadId: outboundExternalThreadId,
      text: body,
      metadata: enriched.enrichment.metadata,
      persistConversationMessage: true,
    });

    const externalMessageId =
      typeof result.externalMessageId === "string" ? result.externalMessageId : null;

    if (ticketId) {
      const { data: row } = await supabase
        .from("support_tickets")
        .select("metadata")
        .eq("id", ticketId)
        .eq("company_id", input.companyId)
        .maybeSingle();
      const previous = (row?.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {}) as Record<string, unknown>;
      await supabase
        .from("support_tickets")
        .update({
          metadata: {
            ...previous,
            [TICKET_CLOSE_NOTIFY_META.notifiedAt]: new Date().toISOString(),
            [TICKET_CLOSE_NOTIFY_META.channel]: channelKey,
            [TICKET_CLOSE_NOTIFY_META.messageId]: externalMessageId,
            [TICKET_CLOSE_NOTIFY_META.idempotencyKey]: input.idempotencyKey ?? null,
          },
        })
        .eq("id", ticketId)
        .eq("company_id", input.companyId);
    }

    return {
      ok: true,
      channelKey,
      deliveryStatus: result.deliveryStatus ?? null,
      externalMessageId,
      alreadyNotified: false,
    };
  } catch (error) {
    return {
      ok: false,
      reason: "dispatch_failed",
      message: error instanceof Error ? error.message : "Failed to notify the customer.",
    };
  }
}
