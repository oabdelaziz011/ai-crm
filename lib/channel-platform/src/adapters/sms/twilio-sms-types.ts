/** SMS channel types (Twilio + Infobip). */

export type SmsVendorProvider = "twilio" | "infobip";

/** Runtime credentials loaded from company_sms_settings (decrypted). */
export type TwilioSmsCredentials = {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  enabled?: boolean;
  provider: SmsVendorProvider;
  /** Infobip only */
  apiKey?: string;
  baseUrl?: string;
};

export type TwilioSmsChannelReferences = {
  accountSid?: string;
  fromNumber?: string;
  provider?: string;
  baseUrl?: string;
  credentialsSource?: string;
};

export type TwilioSmsSendPayload = {
  To: string;
  From: string;
  Body: string;
  StatusCallback?: string;
};

export type TwilioSmsApiMessageResponse = {
  sid?: string;
  status?: string;
  error_code?: number | string | null;
  error_message?: string | null;
  to?: string;
  from?: string;
  body?: string;
};

/** Normalized Twilio inbound / status callback form fields. */
export type TwilioSmsWebhookFields = {
  MessageSid: string;
  AccountSid?: string;
  From?: string;
  To?: string;
  Body?: string;
  SmsStatus?: string;
  MessageStatus?: string;
  ErrorCode?: string;
  ErrorMessage?: string;
};

export type TwilioDeliveryStatus = "pending" | "sent" | "delivered" | "failed";

/**
 * Map Twilio MessageStatus / SmsStatus into channel_delivery_events statuses.
 * Terminal statuses: delivered, failed.
 */
export function mapTwilioMessageStatus(raw: string | undefined | null): TwilioDeliveryStatus | null {
  const status = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!status) return null;
  switch (status) {
    case "queued":
    case "accepted":
    case "sending":
    case "scheduled":
      return "pending";
    case "sent":
      return "sent";
    case "delivered":
    case "read":
      return "delivered";
    case "failed":
    case "undelivered":
    case "canceled":
    case "cancelled":
      return "failed";
    default:
      return null;
  }
}
