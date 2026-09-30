export type QuoteSendChannel = "email" | "whatsapp";

export type QuoteSendUnavailableReason =
  | "not_entitled"
  | "no_email_channel"
  | "no_recipient_email"
  | "no_whatsapp_channel"
  | "no_recipient_phone"
  | "no_whatsapp_conversation"
  | "whatsapp_window_closed";

export type QuoteSendChannelOption = {
  channel: QuoteSendChannel;
  available: boolean;
  reason: QuoteSendUnavailableReason | null;
  recipient: string | null;
};

export type QuoteSendOptions = {
  quoteId: string;
  quoteStatus: string;
  hasLines: boolean;
  channels: QuoteSendChannelOption[];
};

export type QuoteSendResult = {
  attemptId: string;
  channel: QuoteSendChannel;
  status: "sent";
  recipient: string | null;
  conversationId: string | null;
  externalMessageId: string | null;
  quoteStatus: string | null;
  sentAt: string | null;
  quoteStatusUpdated: boolean;
  replayed: boolean;
};

export class QuoteSendClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "QuoteSendClientError";
  }
}
