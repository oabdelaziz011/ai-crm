import type { SupabaseClient } from "@supabase/supabase-js";
import type { WebhookEventType } from "@/lib/integration/types";
import { getIntegrationPlatformServices } from "@/lib/integration/services/integration-platform-factory";
import { getPluginPlatformServices } from "@/lib/plugins/services/plugin-platform-factory";
import type { PluginEventType } from "@/lib/plugins/types";

/** Central enterprise event publisher — wires Integration Hub + Plugin runtime. */
export class EnterpriseEventPublisher {
  private readonly integration = getIntegrationPlatformServices();
  private readonly plugins = getPluginPlatformServices();

  async publish(input: {
    companyId: string;
    eventType: WebhookEventType;
    eventId: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.integration.events.publish(input);
    } catch (err) {
      console.error("[EnterpriseEventPublisher] integration bus failed:", err);
    }

    try {
      await this.plugins.events.dispatch(
        input.companyId,
        input.eventType as PluginEventType,
        input.payload,
      );
    } catch (err) {
      console.error("[EnterpriseEventPublisher] plugin dispatch failed:", err);
    }
  }
}

let cached: EnterpriseEventPublisher | null = null;

export function getEnterpriseEventPublisher(): EnterpriseEventPublisher {
  if (!cached) cached = new EnterpriseEventPublisher();
  return cached;
}

/** Maps booking domain events to integration bus event types. */
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

/** Booking event publisher adapter for enterprise bus. */
export class IntegrationBookingEventPublisher {
  constructor(private readonly inner?: { publish(event: unknown): Promise<void> }) {}

  async publish(event: { type: string; payload: { booking: { id: string; company_id: string } } }): Promise<void> {
    if (this.inner) await this.inner.publish(event);

    const busType = bookingEventToBusType(event.type);
    if (!busType) return;

    const booking = event.payload.booking;
    await getEnterpriseEventPublisher().publish({
      companyId: booking.company_id,
      eventType: busType,
      eventId: `${booking.id}:${event.type}:${Date.now()}`,
      payload: { bookingId: booking.id, eventType: event.type },
    });
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
