/**
 * Customer WhatsApp follow-up for sales-order lifecycle transitions.
 * Uses company Meta WhatsApp (same transport as worker notify). No Email fallback.
 * Outside Meta messaging window → skipped (recorded).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isWithinMessagingResponseWindow } from "@/lib/campaigns/thread-eligibility";
import { sendWhatsAppTextMessage } from "@/lib/notifications/providers/whatsapp/services/whatsapp-api-client";
import type { SalesOrderStatus } from "./sales-order-types";

export type CustomerStatusNotifyOutcome =
  | "sent"
  | "skipped"
  | "failed"
  | "already_sent";

export type CustomerStatusNotifyResult = {
  outcome: CustomerStatusNotifyOutcome;
  reason: string;
  messageId: string | null;
  messageText: string;
  idempotencyKey: string;
};

export function buildCustomerOrderStatusMessage(input: {
  orderNumber: string;
  status: SalesOrderStatus | string;
  customerName?: string | null;
}): string {
  const name = (input.customerName ?? "").trim() || "there";
  const orderNumber = input.orderNumber.trim();
  switch (input.status) {
    case "pending_approval":
      return `Hi ${name}, we received order ${orderNumber}. It is pending team approval. We will update you once it is confirmed.`;
    case "confirmed":
      return `Hi ${name}, order ${orderNumber} is confirmed. We are preparing it for delivery.`;
    case "processing":
      return `Hi ${name}, order ${orderNumber} is now being processed.`;
    case "out_for_delivery":
      return `Hi ${name}, order ${orderNumber} is out for delivery.`;
    case "delivered":
      return `Hi ${name}, order ${orderNumber} has been marked delivered. Thank you.`;
    case "cancelled":
      return `Hi ${name}, order ${orderNumber} has been cancelled. If you have questions, reply here.`;
    default:
      return `Hi ${name}, order ${orderNumber} status is now: ${input.status}.`;
  }
}

async function resolveWhatsAppConversationWindow(
  client: SupabaseClient,
  conversationId: string | null | undefined,
): Promise<
  | { ok: true; lastInboundAt: string | null }
  | { ok: false; reason: string }
> {
  const id = String(conversationId ?? "").trim();
  if (!id) return { ok: false, reason: "no_conversation" };

  const { data: session, error } = await client
    .from("channel_sessions")
    .select("channel_key, last_inbound_at, company_channel_id, external_thread_id")
    .eq("conversation_id", id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, reason: error.message };
  if (!session?.company_channel_id || !session.external_thread_id) {
    return { ok: false, reason: "no_channel_session" };
  }
  const channelKey = String(session.channel_key ?? "").toLowerCase();
  if (channelKey !== "whatsapp") {
    return { ok: false, reason: `channel_not_whatsapp:${channelKey || "unknown"}` };
  }
  return {
    ok: true,
    lastInboundAt: session.last_inbound_at ? String(session.last_inbound_at) : null,
  };
}

export async function notifyCustomerOrderStatusOnWhatsApp(input: {
  client: SupabaseClient;
  companyId: string;
  orderId: string;
  orderNumber: string;
  status: SalesOrderStatus | string;
  conversationId: string | null | undefined;
  customerPhone: string | null | undefined;
  customerName?: string | null;
  idempotencyKey: string;
  /** When true, do not call Meta — record dry-run success. */
  dryRun?: boolean;
}): Promise<CustomerStatusNotifyResult> {
  const messageText = buildCustomerOrderStatusMessage({
    orderNumber: input.orderNumber,
    status: input.status,
    customerName: input.customerName,
  });
  const idempotencyKey = input.idempotencyKey.trim();

  const { data: existing } = await input.client
    .from("sales_orders")
    .select(
      "customer_status_notify_status, customer_status_notify_idempotency_key, customer_status_notify_message_id, customer_status_notify_for_status",
    )
    .eq("company_id", input.companyId)
    .eq("id", input.orderId)
    .maybeSingle();

  if (
    existing?.customer_status_notify_status === "sent" &&
    existing?.customer_status_notify_for_status === input.status &&
    existing?.customer_status_notify_idempotency_key === idempotencyKey
  ) {
    return {
      outcome: "already_sent",
      reason: "idempotent_replay",
      messageId: existing.customer_status_notify_message_id
        ? String(existing.customer_status_notify_message_id)
        : null,
      messageText,
      idempotencyKey,
    };
  }

  const phone = String(input.customerPhone ?? "").trim();
  if (!phone) {
    await recordCustomerStatusNotify(input.client, {
      companyId: input.companyId,
      orderId: input.orderId,
      status: input.status,
      idempotencyKey,
      notifyStatus: "skipped",
      error: "no_customer_phone",
      messageId: null,
    });
    return {
      outcome: "skipped",
      reason: "no_customer_phone",
      messageId: null,
      messageText,
      idempotencyKey,
    };
  }

  const windowCheck = await resolveWhatsAppConversationWindow(input.client, input.conversationId);
  if (!windowCheck.ok) {
    await recordCustomerStatusNotify(input.client, {
      companyId: input.companyId,
      orderId: input.orderId,
      status: input.status,
      idempotencyKey,
      notifyStatus: "skipped",
      error: windowCheck.reason,
      messageId: null,
    });
    return {
      outcome: "skipped",
      reason: windowCheck.reason,
      messageId: null,
      messageText,
      idempotencyKey,
    };
  }

  if (!isWithinMessagingResponseWindow(windowCheck.lastInboundAt)) {
    await recordCustomerStatusNotify(input.client, {
      companyId: input.companyId,
      orderId: input.orderId,
      status: input.status,
      idempotencyKey,
      notifyStatus: "skipped",
      error: "messaging_window_closed",
      messageId: null,
    });
    return {
      outcome: "skipped",
      reason: "messaging_window_closed",
      messageId: null,
      messageText,
      idempotencyKey,
    };
  }

  if (input.dryRun) {
    const messageId = `dry-run-customer-status-${Date.now()}`;
    await recordCustomerStatusNotify(input.client, {
      companyId: input.companyId,
      orderId: input.orderId,
      status: input.status,
      idempotencyKey,
      notifyStatus: "sent",
      error: null,
      messageId,
    });
    return {
      outcome: "sent",
      reason: "dry_run",
      messageId,
      messageText,
      idempotencyKey,
    };
  }

  try {
    const result = await sendWhatsAppTextMessage(input.companyId, phone, messageText);
    const messageId =
      result && typeof result === "object" && "messageId" in result
        ? String((result as { messageId?: string }).messageId ?? "") || null
        : null;
    await recordCustomerStatusNotify(input.client, {
      companyId: input.companyId,
      orderId: input.orderId,
      status: input.status,
      idempotencyKey,
      notifyStatus: "sent",
      error: null,
      messageId,
    });
    return {
      outcome: "sent",
      reason: "delivered",
      messageId,
      messageText,
      idempotencyKey,
    };
  } catch (error) {
    const err = error instanceof Error ? error.message : String(error);
    await recordCustomerStatusNotify(input.client, {
      companyId: input.companyId,
      orderId: input.orderId,
      status: input.status,
      idempotencyKey,
      notifyStatus: "failed",
      error: err,
      messageId: null,
    });
    return {
      outcome: "failed",
      reason: err,
      messageId: null,
      messageText,
      idempotencyKey,
    };
  }
}

export async function recordCustomerStatusNotify(
  client: SupabaseClient,
  input: {
    companyId: string;
    orderId: string;
    status: string;
    idempotencyKey: string;
    notifyStatus: "pending" | "sent" | "failed" | "skipped";
    error: string | null;
    messageId: string | null;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await client
    .from("sales_orders")
    .update({
      customer_status_notify_status: input.notifyStatus,
      customer_status_notify_idempotency_key: input.idempotencyKey,
      customer_status_notify_error: input.error,
      customer_status_notify_message_id: input.messageId,
      customer_status_notify_attempted_at: now,
      customer_status_notify_for_status: input.status,
      updated_at: now,
    })
    .eq("company_id", input.companyId)
    .eq("id", input.orderId);
}
