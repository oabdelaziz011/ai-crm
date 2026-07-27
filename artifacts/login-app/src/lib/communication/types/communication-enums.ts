export const COMMUNICATION_CHANNELS = ["whatsapp", "email", "sms", "push"] as const;
export type CommunicationChannel = (typeof COMMUNICATION_CHANNELS)[number];

export const COMMUNICATION_QUEUE_STATUSES = [
  "queued",
  "processing",
  "sent",
  "delivered",
  "failed",
  "retrying",
  "cancelled",
] as const;
export type CommunicationQueueStatus = (typeof COMMUNICATION_QUEUE_STATUSES)[number];

export const COMMUNICATION_TEMPLATE_KEYS = [
  "booking_created",
  "booking_reminder",
  "booking_cancelled",
  "booking_rescheduled",
  "booking_checked_in",
  "booking_completed",
  "invoice_created",
  "invoice_paid",
  "payment_failed",
  "birthday_greeting",
  "follow_up_reminder",
  "marketing_campaign",
  "customer_created",
] as const;
export type CommunicationTemplateKey = (typeof COMMUNICATION_TEMPLATE_KEYS)[number];

export const REMINDER_OFFSETS = [
  "24h_before",
  "3h_before",
  "1h_before",
  "30m_before",
  "after_appointment",
  "follow_up",
  "birthday",
  "recurring",
] as const;
export type ReminderOffset = (typeof REMINDER_OFFSETS)[number];

export const DOMAIN_EVENT_NAMES = [
  "booking.created",
  "booking.confirmed",
  "booking.cancelled",
  "booking.rescheduled",
  "booking.checked_in",
  "booking.completed",
  "invoice.created",
  "invoice.paid",
  "customer.created",
] as const;
export type DomainEventName = (typeof DOMAIN_EVENT_NAMES)[number];
