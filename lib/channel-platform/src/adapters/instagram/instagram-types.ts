export type InstagramWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    messaging?: InstagramMessagingEvent[];
  }>;
};

export type InstagramMessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: InstagramWebhookMessage;
  delivery?: {
    mids?: string[];
    watermark?: number;
  };
  read?: {
    mid?: string;
    watermark?: number;
  };
};

export type InstagramWebhookMessage = {
  mid?: string;
  text?: string;
  quick_reply?: {
    payload?: string;
  };
  attachments?: Array<{
    type?: string;
    payload?: {
      url?: string;
      sticker_id?: number;
    };
  }>;
  is_echo?: boolean;
  is_deleted?: boolean;
};

export type InstagramQuickReply = {
  content_type: "text";
  title: string;
  payload: string;
};

export type InstagramSendMessagePayload = {
  recipient: { id: string };
  message: {
    text?: string;
    quick_replies?: InstagramQuickReply[];
    attachment?: {
      type: "image" | "video" | "audio" | "file" | "template";
      payload: Record<string, unknown> & { url?: string; is_reusable?: boolean };
    };
  };
};

export type InstagramSendMessageResponse = {
  recipient_id?: string;
  message_id?: string;
  error?: { message?: string; error_user_msg?: string; code?: number };
};

export type ParsedInstagramWebhookEvent =
  | {
      kind: "message";
      idempotencyKey: string;
      externalThreadId: string;
      externalMessageId: string;
      senderExternalId: string;
      instagramBusinessAccountId?: string;
      message: InstagramWebhookMessage;
      raw: Record<string, unknown>;
    }
  | {
      kind: "status";
      idempotencyKey: string;
      externalMessageId: string;
      externalThreadId?: string;
      status: "sent" | "delivered" | "read" | "failed";
      providerResponse?: Record<string, unknown>;
      errorMessage?: string;
      raw: Record<string, unknown>;
    };
