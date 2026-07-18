export type WhatsAppWebhookMessage = {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: WhatsAppMediaPayload;
  audio?: WhatsAppMediaPayload;
  video?: WhatsAppMediaPayload;
  document?: WhatsAppMediaPayload & { filename?: string };
  sticker?: WhatsAppMediaPayload;
  button?: { text: string; payload: string };
  interactive?: { type: string; button_reply?: { id: string; title: string } };
};

export type WhatsAppMediaPayload = {
  id: string;
  mime_type?: string;
  caption?: string;
  filename?: string;
};

export type WhatsAppWebhookStatus = {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title: string; message?: string }>;
};

export type WhatsAppWebhookChangeValue = {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
  messages?: WhatsAppWebhookMessage[];
  statuses?: WhatsAppWebhookStatus[];
};

export type WhatsAppWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: WhatsAppWebhookChangeValue;
    }>;
  }>;
};

export type WhatsAppSendMessagePayload =
  | {
      messaging_product: "whatsapp";
      recipient_type: "individual";
      to: string;
      type: "text";
      text: { body: string; preview_url?: boolean };
    }
  | {
      messaging_product: "whatsapp";
      recipient_type: "individual";
      to: string;
      type: "template";
      template: {
        name: string;
        language: { code: string };
        components?: Array<Record<string, unknown>>;
      };
    }
  | {
      messaging_product: "whatsapp";
      recipient_type: "individual";
      to: string;
      type: "image" | "audio" | "video" | "document";
      image?: { link?: string; id?: string; caption?: string };
      audio?: { link?: string; id?: string };
      video?: { link?: string; id?: string; caption?: string };
      document?: { link?: string; id?: string; caption?: string; filename?: string };
    };

export type WhatsAppSendMessageResponse = {
  messaging_product?: string;
  contacts?: Array<{ input: string; wa_id: string }>;
  messages?: Array<{ id: string }>;
};

export type ParsedWhatsAppWebhookEvent =
  | {
      kind: "message";
      idempotencyKey: string;
      externalThreadId: string;
      externalMessageId: string;
      senderExternalId: string;
      senderName?: string;
      phoneNumberId?: string;
      message: WhatsAppWebhookMessage;
      raw: Record<string, unknown>;
    }
  | {
      kind: "status";
      idempotencyKey: string;
      externalMessageId: string;
      externalThreadId: string;
      status: WhatsAppWebhookStatus["status"];
      providerResponse: Record<string, unknown>;
      errorMessage?: string;
      raw: Record<string, unknown>;
    };
