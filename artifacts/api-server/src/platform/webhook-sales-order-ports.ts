/**
 * Webhook host for AI sales order tools.
 * Reuses CRM customer port + follow-up cancel after purchase.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabaseSalesOrderPorts,
  type SalesOrderToolPorts,
  type ToolCustomerServicePort,
} from "@workspace/ai-tool-router";
import { resolveCompanyActorUserId } from "@workspace/automation-platform";
import i18next from "i18next";
import { MetaWhatsAppTransport } from "@login-app/lib/notifications/providers/whatsapp/adapter/meta-whatsapp-transport";
import { WhatsAppRenderer } from "@login-app/lib/notifications/providers/whatsapp/renderer/whatsapp-renderer";
import { createWhatsAppProvider } from "@login-app/lib/notifications/providers/whatsapp/services/whatsapp-provider";
import { createWhatsAppMessagesCommercialPort } from "./whatsapp-messages-commercial-adapter.js";

export function createWebhookSalesOrderPorts(
  client: SupabaseClient,
  customerService: ToolCustomerServicePort,
): SalesOrderToolPorts {
  return createSupabaseSalesOrderPorts(client, {
    customerService,
    resolveActorUserIdForCompany: (companyId) => resolveCompanyActorUserId(client, companyId),
    async cancelFollowUpAfterPurchase({ companyId, leadId }) {
      const { cancelSalesFollowUpAfterLeadStop } = await import(
        "../services/sales-follow-up-schedule-on-qualify.js"
      );
      await cancelSalesFollowUpAfterLeadStop(client, {
        companyId,
        leadId,
        reason: "converted",
      });
    },
    async notifyCancellationWorkerWhatsApp(input) {
      try {
        const { assertLocalExternalOutboundAllowed } = await import("../lib/local-outbound-guard.js");
        try {
          assertLocalExternalOutboundAllowed("order-cancellation-worker-whatsapp");
        } catch {
          return {
            ok: true,
            messageId: `dry-run-cancel-${input.idempotencyKey}`,
          };
        }

        const { data: existing } = await client
          .from("sales_orders")
          .select("cancellation_notify_status, cancellation_notify_message_id")
          .eq("company_id", input.companyId)
          .eq("id", input.orderId)
          .eq("cancellation_notify_idempotency_key", input.idempotencyKey)
          .maybeSingle();
        if (existing?.cancellation_notify_status === "sent") {
          return {
            ok: true,
            messageId: existing.cancellation_notify_message_id
              ? String(existing.cancellation_notify_message_id)
              : null,
          };
        }

        const t = i18next.getFixedT("en", "common");
        const renderer = WhatsAppRenderer.fromI18n(t);
        const provider = createWhatsAppProvider(client, new MetaWhatsAppTransport(), renderer, {
          whatsappMessagesCommercial: createWhatsAppMessagesCommercialPort(client),
        });
        const result = await provider.sendFreeformText(
          input.companyId,
          input.workerPhone,
          input.message,
        );
        return {
          ok: true,
          messageId:
            result && typeof result === "object" && "messageId" in result
              ? String((result as { messageId?: string }).messageId ?? "") || null
              : null,
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    async notifyCustomerOrderStatusWhatsApp(input) {
      try {
        const { assertLocalExternalOutboundAllowed } = await import("../lib/local-outbound-guard.js");
        try {
          assertLocalExternalOutboundAllowed("order-customer-status-whatsapp");
        } catch {
          return {
            ok: true,
            skipped: true,
            messageId: `dry-run-customer-status-${input.idempotencyKey}`,
          };
        }

        // WhatsApp-only: require a WhatsApp channel session on the conversation (no Email fallback).
        if (input.conversationId) {
          const { data: session } = await client
            .from("channel_sessions")
            .select("channel_key, last_inbound_at")
            .eq("conversation_id", input.conversationId)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const channelKey = String(session?.channel_key ?? "").toLowerCase();
          if (channelKey !== "whatsapp") {
            await client
              .from("sales_orders")
              .update({
                customer_status_notify_status: "skipped",
                customer_status_notify_error: `channel_not_whatsapp:${channelKey || "unknown"}`,
                customer_status_notify_idempotency_key: input.idempotencyKey,
                customer_status_notify_for_status: input.status,
                customer_status_notify_attempted_at: new Date().toISOString(),
              })
              .eq("company_id", input.companyId)
              .eq("id", input.orderId);
            return { ok: true, skipped: true, error: "channel_not_whatsapp" };
          }
        }

        const name = input.customerName.trim() || "there";
        const message = `Hi ${name}, we received order ${input.orderNumber}. It is pending team approval. We will update you once it is confirmed.`;
        const t = i18next.getFixedT("en", "common");
        const renderer = WhatsAppRenderer.fromI18n(t);
        const provider = createWhatsAppProvider(client, new MetaWhatsAppTransport(), renderer, {
          whatsappMessagesCommercial: createWhatsAppMessagesCommercialPort(client),
        });
        const result = await provider.sendFreeformText(
          input.companyId,
          input.customerPhone,
          message,
        );
        const messageId =
          result && typeof result === "object" && "messageId" in result
            ? String((result as { messageId?: string }).messageId ?? "") || null
            : null;
        await client
          .from("sales_orders")
          .update({
            customer_status_notify_status: "sent",
            customer_status_notify_message_id: messageId,
            customer_status_notify_error: null,
            customer_status_notify_idempotency_key: input.idempotencyKey,
            customer_status_notify_for_status: input.status,
            customer_status_notify_attempted_at: new Date().toISOString(),
          })
          .eq("company_id", input.companyId)
          .eq("id", input.orderId);
        return { ok: true, messageId };
      } catch (error) {
        const err = error instanceof Error ? error.message : String(error);
        await client
          .from("sales_orders")
          .update({
            customer_status_notify_status: "failed",
            customer_status_notify_error: err,
            customer_status_notify_idempotency_key: input.idempotencyKey,
            customer_status_notify_for_status: input.status,
            customer_status_notify_attempted_at: new Date().toISOString(),
          })
          .eq("company_id", input.companyId)
          .eq("id", input.orderId);
        return { ok: false, error: err };
      }
    },
  });
}
