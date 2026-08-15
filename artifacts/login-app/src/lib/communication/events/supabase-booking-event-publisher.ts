import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingDomainEvent, BookingEventPublisher } from "@/lib/scheduling/booking-domain/events";
import { createCommunicationPlatform } from "@/lib/communication/services/communication-platform-service";

/** Publishes booking domain events to the communication platform with customer context. */
export class SupabaseCommunicationBookingEventPublisher implements BookingEventPublisher {
  constructor(private readonly client: SupabaseClient) {}

  async publish(event: BookingDomainEvent): Promise<void> {
    const booking =
      event.type === "BookingRescheduled" ? event.payload.booking : event.payload.booking;

    const { data: customer } = await this.client
      .from("customers")
      .select("name, email, phone")
      .eq("id", booking.customer_id)
      .maybeSingle();

    const { data: service } = await this.client
      .from("scheduling_services")
      .select("name")
      .eq("id", booking.service_id)
      .maybeSingle();

    const { data: resource } = await this.client
      .from("scheduling_resources")
      .select("name")
      .eq("id", booking.resource_id)
      .maybeSingle();

    // Always use the injected client (service role on webhooks). The browser
    // singleton would hit RLS and abort createBooking before workflow confirmation.
    try {
      await createCommunicationPlatform(this.client).events.handleBookingEvent(event, {
        customerName: customer?.name ?? "Customer",
        customerEmail: customer?.email ?? null,
        customerPhone: customer?.phone ?? null,
        serviceName: service?.name ?? "",
        resourceName: resource?.name ?? "",
      });
    } catch (error) {
      console.warn(
        "[booking-notifications] side-effect failed; booking create continues",
        error instanceof Error ? error.message : error,
      );
    }
  }
}
