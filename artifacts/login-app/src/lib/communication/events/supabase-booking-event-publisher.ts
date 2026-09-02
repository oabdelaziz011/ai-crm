import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BookingDomainEvent,
  BookingEventPublisher,
  BookingPublishOutcome,
} from "@/lib/scheduling/booking-domain/events";
import { createCommunicationPlatform } from "@/lib/communication/services/communication-platform-service";
import { toPublishOutcome } from "@/lib/communication/events/domain-event-bridge";
import { resolveWhatsAppOutboundPhone } from "@/lib/notifications/providers/whatsapp/services/whatsapp-outbound-phone";

/** Publishes booking domain events to the communication platform with customer context. */
export class SupabaseCommunicationBookingEventPublisher implements BookingEventPublisher {
  constructor(private readonly client: SupabaseClient) {}

  async publish(event: BookingDomainEvent): Promise<BookingPublishOutcome> {
    const booking =
      event.type === "BookingRescheduled" ? event.payload.booking : event.payload.booking;

    let customerQuery = this.client
      .from("customers")
      .select("name, email, phone, phone_e164, company_id")
      .eq("id", booking.customer_id);
    if (booking.company_id) {
      customerQuery = customerQuery.eq("company_id", booking.company_id);
    }
    const { data: customer } = await customerQuery.maybeSingle();

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
      const metadata: Record<string, unknown> = {
        bookingId: booking.id,
      };
      if (
        event.type === "BookingCancelled" &&
        typeof event.payload.businessExceptionItemId === "string" &&
        event.payload.businessExceptionItemId.trim()
      ) {
        metadata.businessExceptionItemId = event.payload.businessExceptionItemId.trim();
      }

      // D5.1 — enqueue only canonical E.164; never raw local legacy phone.
      const outbound = resolveWhatsAppOutboundPhone({
        companyId: booking.company_id,
        customerId: booking.customer_id,
        phone: customer?.phone,
        phone_e164: customer?.phone_e164,
      });
      const outboundPhone = outbound.ok ? outbound.phone : null;

      const result = await createCommunicationPlatform(this.client).events.handleBookingEvent(
        event,
        {
          customerName: customer?.name ?? "Customer",
          customerEmail: customer?.email ?? null,
          customerPhone: outboundPhone,
          serviceName: service?.name ?? "",
          resourceName: resource?.name ?? "",
          metadata,
        },
      );
      return toPublishOutcome(result);
    } catch (error) {
      console.warn(
        "[booking-notifications] side-effect failed; booking create continues",
        error instanceof Error ? error.message : error,
      );
      return {
        ok: false,
        whatsappQueueIds: [],
        whatsappSkipped: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
