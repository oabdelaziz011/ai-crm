export const CHANNEL_PLATFORM_PERMISSIONS = {
  view: "channel.platform.view",
  route: "channel.platform.route",
  dispatch: "channel.platform.dispatch",
} as const;

export const CHANNEL_SESSION_STATUSES = ["active", "closed", "transferred"] as const;

export type ChannelSessionStatus = (typeof CHANNEL_SESSION_STATUSES)[number];

export const INBOUND_PROCESSING_STATUSES = [
  "received",
  "processing",
  "processed",
  "failed",
  "duplicate",
] as const;

export type InboundProcessingStatus = (typeof INBOUND_PROCESSING_STATUSES)[number];

export const DELIVERY_STATUSES = ["pending", "sent", "delivered", "read", "failed"] as const;

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const ATTACHMENT_TYPES = [
  "text",
  "image",
  "audio",
  "video",
  "document",
  "template",
] as const;

export type AttachmentType = (typeof ATTACHMENT_TYPES)[number];

export const WEBHOOK_EVENT_TYPES = [
  "message.received",
  "message.status",
  "message.read",
  "session.opened",
  "session.closed",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export const INBOUND_SOURCES = ["webhook", "direct"] as const;

export type InboundSource = (typeof INBOUND_SOURCES)[number];
