export function resolveWhatsAppWebhookBaseUrl(): string {
  const runtimeEnv = import.meta.env ?? {};
  const configured =
    typeof runtimeEnv.VITE_API_SERVER_URL === "string" ? runtimeEnv.VITE_API_SERVER_URL.trim() : "";
  return configured.replace(/\/$/, "");
}

export function buildWhatsAppWebhookUrl(apiBase: string): string {
  const normalizedBase = apiBase.trim().replace(/\/$/, "");
  if (!normalizedBase) return "/api/webhooks/whatsapp";
  return `${normalizedBase}/api/webhooks/whatsapp`;
}
