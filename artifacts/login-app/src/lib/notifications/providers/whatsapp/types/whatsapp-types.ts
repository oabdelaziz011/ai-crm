export type WhatsAppProviderKind = "meta_cloud" | "twilio" | "360dialog";

export type MetaWhatsAppConfig = {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  webhookVerifyToken: string;
  apiVersion?: string;
  appSecret?: string;
  defaultLanguage: string;
};

export type WhatsAppOutboundMessage = {
  to: string;
  templateKey: string;
  templateId: string;
  languageCode: string;
  bodyParameters: string[];
  fallbackText: string;
};

export type WhatsAppTransportSendResult = {
  messageId: string | null;
  provider: string;
};

export type WhatsAppTransportHealthResult = {
  ok: boolean;
  provider: string;
  latencyMs: number;
  error?: string;
};

/** Transport port — Meta Cloud API today; Twilio / 360dialog later. */
export interface WhatsAppTransport {
  readonly provider: WhatsAppProviderKind;
  send(message: WhatsAppOutboundMessage, config: MetaWhatsAppConfig): Promise<WhatsAppTransportSendResult>;
  healthCheck(config: MetaWhatsAppConfig): Promise<WhatsAppTransportHealthResult>;
}

export type RenderedWhatsAppMessage = {
  templateKey: string;
  templateId: string;
  languageCode: string;
  bodyParameters: string[];
  fallbackText: string;
};

export type WhatsAppDeliveryResult = {
  queueId: string;
  notificationId: string | null;
  companyId: string;
  provider: string;
  status: "completed" | "failed";
  durationMs: number;
  attempts: number;
  lastError: string | null;
  recipientPhone: string | null;
  messageId: string | null;
  templateKey: string | null;
  timestamp: string;
};

export type CompanyWhatsAppSettings = {
  companyId: string;
  enabled: boolean;
  provider: WhatsAppProviderKind;
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  webhookVerifyToken: string;
  apiVersion: string;
  appSecret: string;
  defaultLanguage: string;
  maxRetryCount: number;
  hasAccessToken: boolean;
  hasWebhookVerifyToken: boolean;
  hasAppSecret: boolean;
  updatedAt?: string;
};

export type RecipientPhoneValidation = {
  valid: boolean;
  normalized: string | null;
  error?: string;
};

export type RecipientOptInStatus = {
  optedIn: boolean;
  reason?: string;
};

export const WHATSAPP_PROVIDER = "meta_cloud" as const;

export const DEFAULT_WHATSAPP_MAX_RETRY = 3;

export const WHATSAPP_RETRY_BACKOFF_MS = [0, 30_000, 120_000, 300_000] as const;
