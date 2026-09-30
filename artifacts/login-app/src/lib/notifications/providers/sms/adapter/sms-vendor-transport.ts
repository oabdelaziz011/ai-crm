/**
 * Provider-agnostic SMS send contract used by the notification queue.
 * Node-only — never import from browser bundles.
 */

export type SmsVendorKind = "twilio" | "infobip";

export type SmsVendorSendInput = {
  to: string;
  body: string;
};

export type SmsVendorSendResult = {
  messageId: string;
  status: string | null;
};

export type SmsVendorRuntimeConfig = {
  provider: SmsVendorKind;
  fromNumber: string;
  statusCallback?: string | null;
  /** Twilio */
  accountSid?: string;
  authToken?: string;
  /** Infobip */
  apiKey?: string;
  baseUrl?: string;
};

export type SmsVendorTransport = {
  readonly provider: SmsVendorKind;
  send(message: SmsVendorSendInput, config: SmsVendorRuntimeConfig): Promise<SmsVendorSendResult>;
};
