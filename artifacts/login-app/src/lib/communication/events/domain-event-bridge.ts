import type { DomainEventName } from "@/lib/communication/types";
import type { CommunicationTemplateKey } from "@/lib/communication/types";
import type { CommunicationSendRequest } from "@/lib/communication/types/communication-types";
import type { CommunicationDispatcher } from "@/lib/communication/dispatcher/communication-dispatcher";
import type { ReminderScheduler } from "@/lib/communication/scheduler/reminder-scheduler";
import type { BookingDomainEvent } from "@/lib/scheduling/booking-domain/events";
import type { BookingEventPublisher } from "@/lib/scheduling/booking-domain/events";

const DOMAIN_TEMPLATE_MAP: Record<string, CommunicationTemplateKey> = {
  "booking.created": "booking_created",
  "booking.confirmed": "booking_created",
  "booking.cancelled": "booking_cancelled",
  "booking.rescheduled": "booking_rescheduled",
  "booking.checked_in": "booking_checked_in",
  "booking.completed": "booking_completed",
  "invoice.created": "invoice_created",
  "invoice.paid": "invoice_paid",
  "customer.created": "customer_created",
};

const BOOKING_EVENT_MAP: Record<BookingDomainEvent["type"], DomainEventName> = {
  BookingCreated: "booking.created",
  BookingCancelled: "booking.cancelled",
  BookingRescheduled: "booking.rescheduled",
  BookingCheckedIn: "booking.checked_in",
  BookingCompleted: "booking.completed",
  BookingNoShow: "booking.cancelled",
};

function formatAppointmentVars(booking: {
  start_at: string;
  timezone: string;
  notes: string | null;
}, customerName: string, serviceName: string, resourceName: string): Record<string, string> {
  const start = new Date(booking.start_at);
  return {
    customerName,
    service: serviceName,
    resource: resourceName,
    date: start.toLocaleDateString("en-CA", { timeZone: booking.timezone }),
    time: start.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: booking.timezone }),
    notes: booking.notes ?? "",
  };
}

/** Maps domain events to communication sends — providers unchanged when events grow. */
export class CommunicationDomainEventBridge {
  constructor(
    private readonly dispatcher: CommunicationDispatcher,
    private readonly reminderScheduler: ReminderScheduler,
  ) {}

  async handleDomainEvent(name: DomainEventName, request: Omit<CommunicationSendRequest, "templateKey">): Promise<void> {
    const templateKey = DOMAIN_TEMPLATE_MAP[name];
    if (!templateKey) return;

    await this.dispatcher.send({
      ...request,
      templateKey,
      sourceEvent: name,
      idempotencyKey: request.idempotencyKey ?? `${name}:${request.recipient.customerId ?? ""}:${Date.now()}`,
    });
  }

  async handleBookingEvent(event: BookingDomainEvent, context: {
    customerName: string;
    customerEmail: string | null;
    customerPhone: string | null;
    serviceName: string;
    resourceName: string;
  }): Promise<void> {
    const domainName = BOOKING_EVENT_MAP[event.type];
    if (!domainName) return;

    const booking =
      event.type === "BookingRescheduled"
        ? event.payload.booking
        : event.payload.booking;

    const variables = formatAppointmentVars(
      booking,
      context.customerName,
      context.serviceName,
      context.resourceName,
    );

    if (event.type === "BookingCancelled" && event.payload.reason) {
      variables.reason = event.payload.reason;
    }

    await this.handleDomainEvent(domainName, {
      companyId: booking.company_id,
      channels: ["whatsapp", "email"],
      recipient: {
        customerId: booking.customer_id,
        email: context.customerEmail,
        phone: context.customerPhone,
        name: context.customerName,
      },
      variables,
      idempotencyKey: `${event.type}:${booking.id}:${booking.updated_at}`,
      metadata: { bookingId: booking.id },
    });

    if (event.type === "BookingCreated" || event.type === "BookingRescheduled") {
      await this.reminderScheduler.cancelBookingReminders(booking.company_id, booking.id);
      await this.reminderScheduler.scheduleBookingReminders({
        companyId: booking.company_id,
        bookingId: booking.id,
        appointmentStartIso: booking.start_at,
        timezone: booking.timezone,
        channels: ["whatsapp", "email"],
      });
    }

    if (event.type === "BookingCancelled") {
      await this.reminderScheduler.cancelBookingReminders(booking.company_id, booking.id);
    }
  }
}

export class CommunicationBookingEventPublisher implements BookingEventPublisher {
  constructor(private readonly bridge: CommunicationDomainEventBridge) {}

  async publish(event: BookingDomainEvent): Promise<void> {
    await this.bridge.handleBookingEvent(event, {
      customerName: "Customer",
      customerEmail: null,
      customerPhone: null,
      serviceName: "",
      resourceName: "",
    });
  }
}
