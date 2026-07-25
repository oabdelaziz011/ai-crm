export const NOTIFICATION_STATUSES = ["pending", "delivered", "read", "archived"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const NOTIFICATION_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

export const NOTIFICATION_CHANNELS = [
  "in_app",
  "email",
  "whatsapp",
  "sms",
  "push",
  "webhook",
] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_VISUAL_TYPES = ["success", "warning", "error", "info"] as const;
export type NotificationVisualType = (typeof NOTIFICATION_VISUAL_TYPES)[number];

export const NOTIFICATION_CATEGORIES = [
  "booking",
  "invoice",
  "subscription",
  "whatsapp",
  "system",
  "customer",
  "payment",
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_EVENTS = [
  "appointment_created",
  "appointment_updated",
  "appointment_cancelled",
  "customer_created",
  "invoice_created",
  "payment_received",
  "generic_system",
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export const QUEUE_STATUSES = ["pending", "processing", "completed", "failed"] as const;
export type NotificationQueueStatus = (typeof QUEUE_STATUSES)[number];

export const PREFERENCE_SCOPES = ["user", "tenant"] as const;
export type NotificationPreferenceScope = (typeof PREFERENCE_SCOPES)[number];
