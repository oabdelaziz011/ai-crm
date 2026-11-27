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
  });
}
