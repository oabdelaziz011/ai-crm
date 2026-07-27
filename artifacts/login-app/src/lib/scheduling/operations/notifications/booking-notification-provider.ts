/** Notification provider abstraction for booking lifecycle events (S6.6 Phase 4). */

import { CommunicationBookingNotificationProvider } from "@/lib/communication/events/booking-notification-bridge";

export type BookingNotificationEventType =
  | "booking_cancelled"
  | "booking_rescheduled"
  | "booking_confirmed"
  | "booking_reminder";

export type BookingNotificationChannel = "whatsapp" | "email" | "sms";

export type BookingNotificationPayload = {
  companyId: string;
  bookingId: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  serviceName: string;
  resourceName: string;
  startAt: string;
  timezone: string;
  reason?: string | null;
  notes?: string | null;
};

export type BookingNotificationRequest = {
  event: BookingNotificationEventType;
  channel: BookingNotificationChannel;
  payload: BookingNotificationPayload;
};

export interface BookingNotificationProvider {
  readonly channel: BookingNotificationChannel;
  send(request: BookingNotificationRequest): Promise<void>;
}

export class BookingNotificationDispatcher {
  private readonly providers = new Map<BookingNotificationChannel, BookingNotificationProvider>();

  register(provider: BookingNotificationProvider): void {
    this.providers.set(provider.channel, provider);
  }

  async dispatch(request: BookingNotificationRequest): Promise<void> {
    const provider = this.providers.get(request.channel);
    if (!provider) {
      throw new Error(`NOTIFICATION_PROVIDER_NOT_REGISTERED:${request.channel}`);
    }
    await provider.send(request);
  }

  hasProvider(channel: BookingNotificationChannel): boolean {
    return this.providers.has(channel);
  }
}

let defaultDispatcher: BookingNotificationDispatcher | null = null;

export function getBookingNotificationDispatcher(): BookingNotificationDispatcher {
  if (!defaultDispatcher) {
    defaultDispatcher = new BookingNotificationDispatcher();
    for (const channel of ["whatsapp", "email", "sms"] as const) {
      defaultDispatcher.register(new CommunicationBookingNotificationProvider(channel));
    }
  }
  return defaultDispatcher;
}
