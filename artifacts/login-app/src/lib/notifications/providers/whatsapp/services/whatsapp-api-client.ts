function getApiBaseUrl(): string {
  const runtimeEnv = import.meta.env as Record<string, string | undefined>;
  const base = runtimeEnv.VITE_API_SERVER_URL?.trim() ?? "";
  return base.replace(/\/$/, "");
}

async function postWhatsAppApi<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const base = getApiBaseUrl();
  if (!base) {
    throw new Error("VITE_API_SERVER_URL is not configured");
  }

  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `WhatsApp API failed (${response.status})`);
  }
  return payload;
}

export type WhatsAppHealthResponse = {
  ok: boolean;
  provider: string;
  latencyMs: number;
  enabled: boolean;
  error?: string;
};

export function fetchWhatsAppHealth(companyId: string): Promise<WhatsAppHealthResponse> {
  return postWhatsAppApi<WhatsAppHealthResponse>("/whatsapp/health", { companyId });
}

export function sendWhatsAppTestMessage(companyId: string, recipientPhone: string) {
  return postWhatsAppApi("/whatsapp/test-message", { companyId, recipientPhone });
}

export function processWhatsAppQueue(companyId: string) {
  return postWhatsAppApi("/whatsapp/process-queue", { companyId });
}

export function isWhatsAppApiConfigured(): boolean {
  return Boolean(getApiBaseUrl());
}
