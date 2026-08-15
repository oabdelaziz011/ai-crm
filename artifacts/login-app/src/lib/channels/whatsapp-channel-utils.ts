export function resolveChannelWebhookBaseUrl(): string {
  const runtimeEnv = import.meta.env ?? {};
  // Prefer public webhook host (Cloudflare tunnel) over local API base —
  // Meta cannot call localhost; VITE_API_SERVER_URL stays for browser → api-server.
  const webhookBase =
    typeof runtimeEnv.VITE_WEBHOOK_BASE_URL === "string"
      ? runtimeEnv.VITE_WEBHOOK_BASE_URL.trim()
      : "";
  const apiBase =
    typeof runtimeEnv.VITE_API_SERVER_URL === "string" ? runtimeEnv.VITE_API_SERVER_URL.trim() : "";
  const configured = webhookBase || apiBase;
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

export function buildInstagramWebhookUrl(apiBase: string): string {
  const normalizedBase = apiBase.trim().replace(/\/$/, "");
  if (!normalizedBase) return "/api/webhooks/instagram";
  return `${normalizedBase}/api/webhooks/instagram`;
}

export function buildInstagramChannelWebhookUrl(apiBase: string, companyChannelId: string): string {
  const normalizedBase = apiBase.trim().replace(/\/$/, "");
  const encodedChannelId = encodeURIComponent(companyChannelId.trim());
  if (!normalizedBase) return `/api/webhooks/instagram/${encodedChannelId}`;
  return `${normalizedBase}/api/webhooks/instagram/${encodedChannelId}`;
}

export function buildEmailWebhookUrl(apiBase: string): string {
  const normalizedBase = apiBase.trim().replace(/\/$/, "");
  if (!normalizedBase) return "/api/webhooks/email";
  return `${normalizedBase}/api/webhooks/email`;
}

export function buildEmailChannelWebhookUrl(apiBase: string, companyChannelId: string): string {
  const normalizedBase = apiBase.trim().replace(/\/$/, "");
  const encodedChannelId = encodeURIComponent(companyChannelId.trim());
  if (!normalizedBase) return `/api/webhooks/email/${encodedChannelId}`;
  return `${normalizedBase}/api/webhooks/email/${encodedChannelId}`;
}
