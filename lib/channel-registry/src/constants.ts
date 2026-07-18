export const COMMUNICATION_CHANNEL_KEYS = [
  "whatsapp",
  "telegram",
  "messenger",
  "instagram",
  "web_chat",
  "email",
  "sms",
  "voice",
] as const;

export type CommunicationChannelKey = (typeof COMMUNICATION_CHANNEL_KEYS)[number];

export const COMPANY_CHANNEL_STATUSES = ["pending", "active", "disabled", "error"] as const;

export type CompanyChannelStatus = (typeof COMPANY_CHANNEL_STATUSES)[number];

export const CHANNEL_HEALTH_STATUSES = [
  "connected",
  "disconnected",
  "warning",
  "error",
  "unknown",
] as const;

export type ChannelHealthStatus = (typeof CHANNEL_HEALTH_STATUSES)[number];

export const CHANNEL_PERMISSIONS = {
  view: "channels.view",
  manage: "channels.manage",
} as const;

export const CHANNEL_AUDIT_EVENTS = [
  "channel_connected",
  "channel_disabled",
  "channel_enabled",
  "configuration_updated",
  "health_status_changed",
  "default_channel_changed",
] as const;

export type ChannelAuditEvent = (typeof CHANNEL_AUDIT_EVENTS)[number];
