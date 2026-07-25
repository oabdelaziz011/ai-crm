import type { CreateNotificationInput, NotificationEvent } from "@/lib/notifications/types";

/** Maps business events to notification domain events. Provider-agnostic. */
export const BUSINESS_EVENT_TO_NOTIFICATION: Record<string, NotificationEvent> = {
  "booking.created": "appointment_created",
  "booking.updated": "appointment_updated",
  "booking.cancelled": "appointment_cancelled",
  "customer.created": "customer_created",
  "invoice.created": "invoice_created",
  "payment.received": "payment_received",
  "system.generic": "generic_system",
};

export type NotificationBusinessEvent = {
  name: string;
  companyId: string;
  params?: Record<string, string>;
  userId?: string | null;
};

export function mapBusinessEventToCreateInput(
  event: NotificationBusinessEvent,
  recipients: CreateNotificationInput["recipients"],
): CreateNotificationInput | null {
  const mapped = BUSINESS_EVENT_TO_NOTIFICATION[event.name];
  if (!mapped) return null;

  return {
    companyId: event.companyId,
    event: mapped,
    recipients,
    params: event.params,
    userId: event.userId,
  };
}
