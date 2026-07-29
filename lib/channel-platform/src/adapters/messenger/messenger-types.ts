import type { MetaMessagingWebhookMessage } from "../meta/meta-messaging-webhook.js";

export type MessengerWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    messaging?: MessengerMessagingEvent[];
  }>;
};

export type MessengerMessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: MessengerWebhookMessage;
  postback?: {
    mid?: string;
    title?: string;
    payload?: string;
  };
  delivery?: {
    mids?: string[];
    watermark?: number;
  };
  read?: {
    mid?: string;
    watermark?: number;
  };
};

export type MessengerWebhookMessage = MetaMessagingWebhookMessage;

export type MessengerSendMessagePayload = {
  recipient: { id: string };
  messaging_type?: "RESPONSE" | "UPDATE" | "MESSAGE_TAG";
  message: {
    text?: string;
    attachment?: {
      type: "image" | "video" | "audio" | "file" | "template";
      payload: { url?: string; is_reusable?: boolean; template_type?: string; elements?: unknown[] };
    };
  };
  tag?: string;
};

export type MessengerSendMessageResponse = {
  recipient_id?: string;
  message_id?: string;
  error?: { message?: string; error_user_msg?: string; code?: number };
};
