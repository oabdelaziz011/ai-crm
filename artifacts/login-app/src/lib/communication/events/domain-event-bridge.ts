import type { DomainEventName } from "@/lib/communication/types";
import type { CommunicationTemplateKey } from "@/lib/communication/types";
import type {
  CommunicationSendRequest,
  CommunicationSendResult,
} from "@/lib/communication/types/communication-types";
import type { CommunicationDispatcher } from "@/lib/communication/dispatcher/communication-dispatcher";
import type { ReminderScheduler } from "@/lib/communication/scheduler/reminder-scheduler";
import type {
  BookingDomainEvent,
  BookingEventPublisher,
  BookingPublishOutcome,
} from "@/lib/scheduling/booking-domain/events";

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
  BookingStatusChanged: "booking.checked_in",
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

function toPublishOutcome(result: CommunicationSendResult | null | undefined): BookingPublishOutcome {
  if (!result) {
    return { ok: false, whatsappQueueIds: [], whatsappSkipped: true, error: "no_send_result" };
  }
  const whatsappSkipped = result.skippedChannels.includes("whatsapp") || result.deduplicated;
  const whatsappQueueId = result.channelQueueIds?.whatsapp;
  const whatsappQueueIds = whatsappQueueId ? [whatsappQueueId] : [];
  const whatsappFailed = (result.failedChannels ?? []).includes("whatsapp");
  return {
    // ok reflects WhatsApp enqueue specifically; other channels (email) may fail independently.
    ok: whatsappSkipped || whatsappQueueIds.length > 0 || !whatsappFailed,
    whatsappQueueIds,
    whatsappSkipped,
    error: whatsappFailed && whatsappQueueIds.length === 0 ? "whatsapp_enqueue_failed" : undefined,
  };
}

/** Maps domain events to communication sends — providers unchanged when events grow. */
export class CommunicationDomainEventBridge {
  constructor(
    private readonly dispatcher: CommunicationDispatcher,
    private readonly reminderScheduler: ReminderScheduler,
  ) {}

  async handleDomainEvent(
    name: DomainEventName,
    request: Omit<CommunicationSendRequest, "templateKey">,
  ): Promise<CommunicationSendResult | null> {
    const templateKey = DOMAIN_TEMPLATE_MAP[name];
    if (!templateKey) return null;

    return this.dispatcher.send({
      ...request,
      templateKey,
      sourceEvent: name,
      idempotencyKey: request.idempotencyKey ?? `${name}:${request.recipient.customerId ?? ""}:${Date.now()}`,
    });
  }

  async handleBookingEvent(
    event: BookingDomainEvent,
    context: {
      customerName: string;
      customerEmail: string | null;
      customerPhone: string | null;
      serviceName: string;
      resourceName: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<CommunicationSendResult | null> {
    const domainName = BOOKING_EVENT_MAP[event.type];
    if (!domainName) return null;

    const booking =
      event.type === "BookingRescheduled" ? event.payload.booking : event.payload.booking;

    const variables = formatAppointmentVars(
      booking,
      context.customerName,
      context.serviceName,
      context.resourceName,
    );

    if (event.type === "BookingCancelled") {
      const customerMessage =
        typeof event.payload.customerMessage === "string"
          ? event.payload.customerMessage.trim()
          : "";
      const reason =
        typeof event.payload.reason === "string" ? event.payload.reason.trim() : "";
      // Prefer explicit customer-facing message (apology comment) over internal reason codes.
      variables.reason = customerMessage || reason;
    }

    const metadata: Record<string, unknown> = {
      bookingId: booking.id,
      ...(context.metadata ?? {}),
    };

    const sendResult = await this.handleDomainEvent(domainName, {
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
      metadata,
    });

    if (event.type === "BookingCreated" || event.type === "BookingRescheduled") {
      try {
        await this.reminderScheduler.cancelBookingReminders(booking.company_id, booking.id);
        await this.reminderScheduler.scheduleBookingReminders({
          companyId: booking.company_id,
          bookingId: booking.id,
          appointmentStartIso: booking.start_at,
          timezone: booking.timezone,
          channels: ["whatsapp", "email"],
        });
      } catch (error) {
        console.warn(
          "[booking-reminders] schedule failed; booking create continues",
          error instanceof Error ? error.message : error,
        );
      }
    }

    if (event.type === "BookingCancelled") {
      try {
        await this.reminderScheduler.cancelBookingReminders(booking.company_id, booking.id);
      } catch (error) {
        console.warn(
          "[booking-reminders] cancel failed; booking update continues",
          error instanceof Error ? error.message : error,
        );
      }
    }

    return sendResult;
  }
}

export class CommunicationBookingEventPublisher implements BookingEventPublisher {
  constructor(private readonly bridge: CommunicationDomainEventBridge) {}

  async publish(event: BookingDomainEvent): Promise<BookingPublishOutcome> {
    const result = await this.bridge.handleBookingEvent(event, {
      customerName: "Customer",
      customerEmail: null,
      customerPhone: null,
      serviceName: "",
      resourceName: "",
    });
    return toPublishOutcome(result);
  }
}

export { toPublishOutcome };
