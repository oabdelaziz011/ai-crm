export const WHATSAPP_CHANNEL_CREDENTIALS_SOURCE = "company_whatsapp_settings" as const;

export type WhatsAppChannelReferences = {
  phoneNumberId?: string;
  credentialsSource?: typeof WHATSAPP_CHANNEL_CREDENTIALS_SOURCE | string;
  apiVersion?: string;
};

export type WhatsAppChannelConfiguration = {
  phoneNumberId: string;
  accessToken: string;
  verifyToken: string;
  appSecret?: string;
  apiVersion?: string;
  businessAccountId?: string;
};

export function parseWhatsAppChannelReferences(
  configuration: Record<string, unknown>,
): WhatsAppChannelReferences {
  return {
    phoneNumberId: readOptionalString(configuration, "phoneNumberId"),
    credentialsSource: readOptionalString(configuration, "credentialsSource"),
    apiVersion: readOptionalString(configuration, "apiVersion"),
  };
}

/** @deprecated Secrets live in company_whatsapp_settings. Use resolveWhatsAppRuntimeConfiguration. */
export function parseWhatsAppConfiguration(
  configuration: Record<string, unknown>,
): WhatsAppChannelConfiguration {
  const phoneNumberId = readRequiredString(configuration, "phoneNumberId");
  const accessToken = readRequiredString(configuration, "accessToken");
  const verifyToken = readRequiredString(configuration, "verifyToken");

  return {
    phoneNumberId,
    accessToken,
    verifyToken,
    appSecret: readOptionalString(configuration, "appSecret"),
    apiVersion: readOptionalString(configuration, "apiVersion") ?? "v21.0",
    businessAccountId: readOptionalString(configuration, "businessAccountId"),
  };
}

export function buildWhatsAppChannelReferenceConfiguration(
  phoneNumberId: string,
): Record<string, unknown> {
  return {
    phoneNumberId: phoneNumberId.trim(),
    credentialsSource: WHATSAPP_CHANNEL_CREDENTIALS_SOURCE,
  };
}

function readRequiredString(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`WhatsApp configuration missing required field: ${key}`);
  }
  return value.trim();
}

function readOptionalString(config: Record<string, unknown>, key: string): string | undefined {
  const value = config[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function whatsAppGraphBaseUrl(apiVersion: string): string {
  return `https://graph.facebook.com/${apiVersion}`;
}

export function whatsAppMessagesUrl(config: WhatsAppChannelConfiguration): string {
  return `${whatsAppGraphBaseUrl(config.apiVersion ?? "v21.0")}/${config.phoneNumberId}/messages`;
}
