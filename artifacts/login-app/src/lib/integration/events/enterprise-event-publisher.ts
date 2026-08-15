import type { SupabaseClient } from "@supabase/supabase-js";
import type { WebhookEventType } from "@/lib/integration/types";
import { createModulePublisher, type PlatformEventType } from "@workspace/platform-events";
import { getLoginAppPlatformEventBus } from "@/lib/application-layer/platform-event-bus-factory";

const WEBHOOK_TO_PLATFORM: Readonly<Partial<Record<WebhookEventType, PlatformEventType>>> = Object.freeze({
  "lead.created": "LeadCreated",
  "lead.updated": "LeadUpdated",
  "lead.converted": "LeadConverted",
  "lead.deleted": "LeadUpdated",
  "lead.assigned": "LeadUpdated",
  "booking.created": "BookingCreated",
  "booking.updated": "BookingRescheduled",
  "booking.cancelled": "BookingCancelled",
  "booking.completed": "BookingCompleted",
  "payment.completed": "PaymentCollected",
  "invoice.paid": "InvoicePaid",
  "invoice.created": "InvoiceGenerated",
  "customer.created": "CustomerCreated",
});

/** Legacy bridge — routes webhook-style publishes through Platform Event Bus only. */
export class EnterpriseEventPublisher {
  async publish(input: {
    companyId: string;
    eventType: WebhookEventType;
    eventId: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    const platformType = WEBHOOK_TO_PLATFORM[input.eventType];
    if (!platformType) return;

    const publisher = createModulePublisher(getLoginAppPlatformEventBus(), "integration-bridge");
    await publisher.publish(
      platformType,
      input.payload as never,
      {
        tenantId: input.companyId,
        correlationId: input.eventId,
        actorType: "system",
        sourceModule: "integration-bridge",
      },
    );
  }
}

let cached: EnterpriseEventPublisher | null = null;

export function getEnterpriseEventPublisher(): EnterpriseEventPublisher {
  if (!cached) cached = new EnterpriseEventPublisher();
  return cached;
}

export function bookingEventToBusType(eventType: string): WebhookEventType | null {
  const map: Record<string, WebhookEventType> = {
    BookingCreated: "booking.created",
    BookingUpdated: "booking.updated",
    BookingCancelled: "booking.cancelled",
    BookingCompleted: "booking.completed",
    BookingRescheduled: "booking.updated",
  };
  return map[eventType] ?? null;
}

export class IntegrationBookingEventPublisher {
  constructor(private readonly inner?: { publish(event: unknown): Promise<void> }) {}

  async publish(event: {
    type: string;
    payload: {
      booking: {
        id: string;
        company_id: string;
        customer_id?: string;
        start_at?: string;
        updated_at?: string;
        cancelled_at?: string | null;
        completed_at?: string | null;
      };
    };
  }): Promise<void> {
    try {
      if (this.inner) await this.inner.publish(event);
    } catch (error) {
      console.warn(
        "[booking-side-effects] inner publisher failed; booking create continues",
        error instanceof Error ? error.message : error,
      );
    }

    const busType = bookingEventToBusType(event.type);
    if (!busType) return;

    const booking = event.payload.booking;
    const nowIso = new Date().toISOString();
    try {
      await getEnterpriseEventPublisher().publish({
        companyId: booking.company_id,
        eventType: busType,
        eventId: `${booking.id}:${event.type}:${Date.now()}`,
        payload: {
          bookingId: booking.id,
          customerId: booking.customer_id ?? "",
          eventType: event.type,
          scheduledAt: booking.start_at ?? nowIso,
          cancelledAt: booking.cancelled_at ?? booking.updated_at ?? nowIso,
          completedAt: booking.completed_at ?? booking.updated_at ?? nowIso,
        },
      });
    } catch (error) {
      console.warn(
        "[booking-side-effects] platform event publish failed; booking create continues",
        error instanceof Error ? error.message : error,
      );
    }
  }
}

export async function checkPlatformHealth(client: SupabaseClient): Promise<{ ready: boolean; checks: Record<string, boolean> }> {
  const { data, error } = await client.rpc("platform_health_check_v1");
  if (error) return { ready: false, checks: {} };
  const result = data as { status?: string; checks?: Record<string, boolean> } | null;
  return {
    ready: result?.status === "ready",
    checks: result?.checks ?? {},
  };
}
