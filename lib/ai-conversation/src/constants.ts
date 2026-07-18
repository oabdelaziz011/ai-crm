/** Generic channel types — adapters map external surfaces to these values. */
export const CONVERSATION_CHANNEL_TYPES = [
  "web_chat",
  "whatsapp",
  "messenger",
  "telegram",
  "instagram",
  "voice",
  "email",
  "sms",
] as const;

export type ConversationChannelType = (typeof CONVERSATION_CHANNEL_TYPES)[number];

/** State machine states from docs/architecture/ai-platform.md §5 */
export const CONVERSATION_STATES = [
  "idle",
  "greeting",
  "collecting_information",
  "waiting_user",
  "waiting_api",
  "completed",
  "cancelled",
  "transferred_to_human",
  "closed",
] as const;

export type ConversationState = (typeof CONVERSATION_STATES)[number];

export const PARTICIPANT_TYPES = ["customer", "employee", "assistant", "system"] as const;

export type ParticipantType = (typeof PARTICIPANT_TYPES)[number];

export const MESSAGE_TYPES = ["incoming", "outgoing", "system", "internal_note"] as const;

export type MessageType = (typeof MESSAGE_TYPES)[number];

export const MESSAGE_CONTENT_TYPES = [
  "text",
  "audio",
  "image",
  "template",
  "tool_result",
  "system",
  "media",
  "json",
] as const;

export type MessageContentType = (typeof MESSAGE_CONTENT_TYPES)[number];

export const CONVERSATION_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export type ConversationPriority = (typeof CONVERSATION_PRIORITIES)[number];

export const MESSAGE_STATUSES = ["pending", "sent", "delivered", "failed", "read"] as const;

export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const CONVERSATION_PERMISSIONS = {
  view: "ai.conversations.view",
  reply: "ai.conversations.reply",
  takeover: "ai.conversations.takeover",
  release: "ai.conversations.release",
} as const;

export const CONVERSATION_AUDIT_EVENTS = [
  "conversation_created",
  "conversation_closed",
  "participant_added",
  "participant_removed",
  "message_added",
  "assignment_changed",
  "state_changed",
  "conversation_started",
  "greeting_completed",
  "waiting_for_customer",
  "waiting_for_tool",
  "conversation_completed",
  "conversation_cancelled",
  "transferred_to_human",
  "returned_to_ai",
  "conversation_locked",
  "priority_changed",
  "unread_reset",
  "metadata_updated",
] as const;

export type ConversationAuditEvent = (typeof CONVERSATION_AUDIT_EVENTS)[number];
