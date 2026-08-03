import type { PlatformEventSubscriber, PlatformEventType } from "@workspace/platform-events";
import { getIntegrationPlatformServices } from "@/lib/integration/services/integration-platform-factory";
import { getPluginPlatformServices } from "@/lib/plugins/services/plugin-platform-factory";
import type { PluginEventType } from "@/lib/plugins/types";
import type { WebhookEventType } from "@/lib/integration/types";

const PLATFORM_TO_WEBHOOK: Readonly<Partial<Record<string, WebhookEventType>>> = Object.freeze({
  LeadCreated: "lead.created",
  LeadConverted: "lead.converted",
  BookingCreated: "booking.created",
  BookingCancelled: "booking.cancelled",
  BookingCompleted: "booking.completed",
  BookingRescheduled: "booking.updated",
  PaymentCollected: "payment.completed",
  InvoicePaid: "invoice.paid",
  InvoiceGenerated: "invoice.created",
  CustomerCreated: "customer.created",
});

/** Forwards platform events to Integration Hub + Plugin runtime (single bus path). */
export function createIntegrationEventSubscriber(): PlatformEventSubscriber {
  const integration = getIntegrationPlatformServices();
  const plugins = getPluginPlatformServices();

  return {
    subscriberId: "integration",
    subscribedEvents: Object.keys(PLATFORM_TO_WEBHOOK) as PlatformEventType[],

    async handle(envelope) {
      const webhookType = PLATFORM_TO_WEBHOOK[envelope.eventType];
      if (!webhookType) return;

      try {
        await integration.events.publish({
          companyId: envelope.tenantId,
          eventType: webhookType,
          eventId: envelope.eventId,
          payload: envelope.payload as Record<string, unknown>,
        });
      } catch (err) {
        console.error("[IntegrationSubscriber] integration publish failed:", err);
      }

      try {
        await plugins.events.dispatch(
          envelope.tenantId,
          webhookType as PluginEventType,
          envelope.payload as Record<string, unknown>,
        );
      } catch (err) {
        console.error("[IntegrationSubscriber] plugin dispatch failed:", err);
      }
    },
  };
}
