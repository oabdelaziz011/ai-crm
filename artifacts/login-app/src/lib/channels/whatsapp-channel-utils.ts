export function resolveChannelWebhookBaseUrl(): string {
  const runtimeEnv = import.meta.env ?? {};
  const configured =
    typeof runtimeEnv.VITE_API_SERVER_URL === "string" ? runtimeEnv.VITE_API_SERVER_URL.trim() : "";
  return configured.replace(/\/$/, "");
}

/** @deprecated Prefer resolveChannelWebhookBaseUrl */
export function resolveWhatsAppWebhookBaseUrl(): string {
  return resolveChannelWebhookBaseUrl();
}

export function buildWhatsAppWebhookUrl(apiBase: string): string {
  const normalizedBase = apiBase.trim().replace(/\/$/, "");
  if (!normalizedBase) return "/api/webhooks/whatsapp";
  return `${normalizedBase}/api/webhooks/whatsapp`;
}

export function buildMessengerWebhookUrl(apiBase: string): string {
  const normalizedBase = apiBase.trim().replace(/\/$/, "");
  if (!normalizedBase) return "/api/webhooks/messenger";
  return `${normalizedBase}/api/webhooks/messenger`;
}

export function buildMessengerChannelWebhookUrl(apiBase: string, companyChannelId: string): string {
  const normalizedBase = apiBase.trim().replace(/\/$/, "");
  const encodedChannelId = encodeURIComponent(companyChannelId.trim());
  if (!normalizedBase) return `/api/webhooks/messenger/${encodedChannelId}`;
  return `${normalizedBase}/api/webhooks/messenger/${encodedChannelId}`;
}
