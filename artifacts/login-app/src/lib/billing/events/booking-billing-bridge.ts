import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingDomainEvent, BookingEventPublisher } from "@/lib/scheduling/booking-domain/events";
import type { InvoiceEngineService } from "@/lib/billing/invoices/invoice-engine-service";
import { PricingEngineService } from "@/lib/billing/pricing/pricing-engine-service";

/** Creates invoices from booking domain events — no duplicated booking logic. */
export class BookingBillingBridge implements BookingEventPublisher {
  private readonly pricing: PricingEngineService;

  constructor(
    private readonly client: SupabaseClient,
    private readonly invoiceEngine: InvoiceEngineService,
    private readonly inner?: BookingEventPublisher,
  ) {
    this.pricing = new PricingEngineService(client);
  }

  async publish(event: BookingDomainEvent): Promise<void> {
    if (this.inner) await this.inner.publish(event);

    const booking =
      event.type === "BookingRescheduled" ? event.payload.booking : event.payload.booking;

    const { data: settings } = await this.client
      .from("company_financial_settings")
      .select("auto_invoice_on_booking, auto_invoice_on_completion")
      .eq("company_id", booking.company_id)
      .maybeSingle();

    const autoOnBooking = settings?.auto_invoice_on_booking ?? true;
    const autoOnCompletion = settings?.auto_invoice_on_completion ?? false;

    const shouldInvoice =
      (event.type === "BookingCreated" && autoOnBooking) ||
      (event.type === "BookingCompleted" && autoOnCompletion);

    if (!shouldInvoice || !booking.customer_id) return;

    const existing = booking.invoice_id;
    if (existing) return;

    const price = await this.pricing.resolve({
      companyId: booking.company_id,
      serviceId: booking.service_id,
      resourceId: booking.resource_id,
      branchId: booking.branch_id,
    });

    const { data: service } = await this.client
      .from("scheduling_services")
      .select("name")
      .eq("id", booking.service_id)
      .maybeSingle();

    const { data: owner } = await this.client
      .from("profiles")
      .select("user_id")
      .eq("company_id", booking.company_id)
      .limit(1)
      .maybeSingle();

    if (!owner?.user_id) return;

    const invoice = await this.invoiceEngine.createDraft(
      {
        companyId: booking.company_id,
        customerId: booking.customer_id,
        bookingId: booking.id,
        branchId: booking.branch_id,
        lineItems: [
          {
            description: service?.name ?? "Service",
            quantity: 1,
            unitPriceCents: price.priceCents,
            taxCents: 0,
            discountCents: 0,
            totalCents: price.priceCents,
            serviceId: booking.service_id,
            resourceId: booking.resource_id,
          },
        ],
      },
      owner.user_id,
    );

    await this.invoiceEngine.issue(booking.company_id, invoice.id);
  }
}

/** Composite publisher — communication + billing. */
export class CompositeBookingEventPublisher implements BookingEventPublisher {
  constructor(private readonly publishers: BookingEventPublisher[]) {}

  async publish(event: BookingDomainEvent): Promise<void> {
    for (const publisher of this.publishers) {
      await publisher.publish(event);
    }
  }
}
