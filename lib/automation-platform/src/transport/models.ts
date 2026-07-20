import type { AutomationChannel } from "../constants.js";

export const DELIVERY_STATUSES = ["queued", "sent", "delivered", "read", "failed"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const OUTBOUND_MESSAGE_KINDS = ["text", "buttons", "list", "media", "template"] as const;
export type OutboundMessageKind = (typeof OUTBOUND_MESSAGE_KINDS)[number];

export const INBOUND_MESSAGE_KINDS = ["text", "interactive_reply", "media", "location", "contact"] as const;
export type InboundMessageKind = (typeof INBOUND_MESSAGE_KINDS)[number];

export const MEDIA_TYPES = ["image", "audio", "video", "document", "file"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export type OutboundMessageBase = {
  id?: string;
  companyId: string;
  channel: AutomationChannel;
  externalUserId: string;
  sessionId?: string | null;
  metadata?: Record<string, unknown>;
};

export type TextOutboundMessage = OutboundMessageBase & {
  kind: "text";
  text: string;
};

export type ButtonOption = {
  id: string;
  label: string;
};

export type ButtonsOutboundMessage = OutboundMessageBase & {
  kind: "buttons";
  text: string;
  buttons: ButtonOption[];
};

export type ListSection = {
  title: string;
  rows: Array<{ id: string; title: string; description?: string }>;
};

export type ListOutboundMessage = OutboundMessageBase & {
  kind: "list";
  title: string;
  body: string;
  buttonLabel: string;
  sections: ListSection[];
};

export type MediaOutboundMessage = OutboundMessageBase & {
  kind: "media";
  mediaType: MediaType;
  url: string;
  caption?: string;
  mimeType?: string;
};

export type TemplateOutboundMessage = OutboundMessageBase & {
  kind: "template";
  templateKey: string;
  language?: string;
  variables: Record<string, unknown>;
};

export type OutboundMessage =
  | TextOutboundMessage
  | ButtonsOutboundMessage
  | ListOutboundMessage
  | MediaOutboundMessage
  | TemplateOutboundMessage;

export type InboundMessageBase = {
  companyId: string;
  channel: AutomationChannel;
  externalUserId: string;
  customerId?: string | null;
  receivedAt: string;
  externalMessageId?: string | null;
  metadata?: Record<string, unknown>;
};

export type TextInboundMessage = InboundMessageBase & {
  kind: "text";
  text: string;
};

export type InteractiveReplyInboundMessage = InboundMessageBase & {
  kind: "interactive_reply";
  replyId: string;
  title?: string;
  payload?: Record<string, unknown>;
};

export type MediaInboundMessage = InboundMessageBase & {
  kind: "media";
  mediaType: MediaType;
  url: string;
  mimeType?: string;
  caption?: string;
};

export type LocationInboundMessage = InboundMessageBase & {
  kind: "location";
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
};

export type ContactInboundMessage = InboundMessageBase & {
  kind: "contact";
  name: string;
  phone?: string;
  email?: string;
};

export type InboundMessage =
  | TextInboundMessage
  | InteractiveReplyInboundMessage
  | MediaInboundMessage
  | LocationInboundMessage
  | ContactInboundMessage;

export type DeliveryResult = {
  messageId: string;
  status: DeliveryStatus;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
};

export type ProviderCapabilities = {
  channel: AutomationChannel;
  providerKey: string;
  supportsText: boolean;
  supportsButtons: boolean;
  supportsLists: boolean;
  supportsMedia: boolean;
  supportsTemplates: boolean;
  supportsInteractiveReplies: boolean;
  supportsDeliveryReceipts: boolean;
  supportsReadReceipts: boolean;
};

export type ProviderContext = {
  companyId: string;
  webhookSecret?: string | null;
};

export type WebhookVerificationInput = {
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
  secret?: string | null;
};

export type WebhookRequest = {
  channel: AutomationChannel;
  companyId: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
  payload: unknown;
};

export type WebhookProcessResult = {
  verified: boolean;
  inbound: InboundMessage | null;
  deliveryUpdates: DeliveryResult[];
};

export function extractInboundText(message: InboundMessage): string {
  switch (message.kind) {
    case "text":
      return message.text;
    case "interactive_reply":
      return message.title ?? message.replyId;
    case "media":
      return message.caption ?? message.url;
    case "location":
      return message.name ?? `${message.latitude},${message.longitude}`;
    case "contact":
      return message.name;
    default:
      return "";
  }
}
