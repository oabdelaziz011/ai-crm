import { supabase } from "@/lib/supabase";

function getApiBaseUrl(): string {
  const runtimeEnv = import.meta.env as Record<string, string | undefined>;
  const base = runtimeEnv.VITE_API_SERVER_URL?.trim() ?? "";
  return base.replace(/\/$/, "");
}

async function buildAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function postWhatsAppApi<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const base = getApiBaseUrl();
  if (!base) {
    throw new Error("VITE_API_SERVER_URL is not configured");
  }

  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: await buildAuthHeaders(),
    credentials: "include",
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as T & { error?: string; message?: string };
  if (!response.ok) {
    throw new Error(payload.message ?? payload.error ?? `WhatsApp API failed (${response.status})`);
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
