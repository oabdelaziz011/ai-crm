/** Bridges booking lifecycle notifications to the Communication Platform (S6.8). */

import type {
  BookingNotificationChannel,
  BookingNotificationEventType,
  BookingNotificationPayload,
  BookingNotificationProvider,
  BookingNotificationRequest,
} from "@/lib/scheduling/operations/notifications/booking-notification-provider";
import { getCommunicationPlatform } from "@/lib/communication";
import type { CommunicationTemplateKey } from "@/lib/communication/types";

const EVENT_TEMPLATE_MAP: Record<BookingNotificationEventType, CommunicationTemplateKey> = {
  booking_confirmed: "booking_created",
  booking_cancelled: "booking_cancelled",
  booking_rescheduled: "booking_rescheduled",
  booking_reminder: "booking_reminder",
};

export class CommunicationBookingNotificationProvider implements BookingNotificationProvider {
  constructor(readonly channel: BookingNotificationChannel) {}

  async send(request: BookingNotificationRequest): Promise<void> {
    const templateKey = EVENT_TEMPLATE_MAP[request.event];
    const start = new Date(request.payload.startAt);

    await getCommunicationPlatform().dispatcher.send({
      companyId: request.payload.companyId,
      templateKey,
      channels: [this.channel],
      recipient: {
        customerId: request.payload.customerId,
        email: request.payload.customerEmail,
        phone: request.payload.customerPhone,
        name: request.payload.customerName,
      },
      variables: {
        customerName: request.payload.customerName,
        service: request.payload.serviceName,
        resource: request.payload.resourceName,
        date: start.toLocaleDateString("en-CA", { timeZone: request.payload.timezone }),
        time: start.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: request.payload.timezone,
        }),
        reason: request.payload.reason ?? "",
        notes: request.payload.notes ?? "",
      },
      idempotencyKey: `${request.event}:${request.payload.bookingId}:${this.channel}`,
      metadata: { bookingId: request.payload.bookingId },
    });
  }
}

export type { BookingNotificationPayload, BookingNotificationRequest };
