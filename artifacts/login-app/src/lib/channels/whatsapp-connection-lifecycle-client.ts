import {
  isAuthenticatedApiConfigured,
  resolveAuthenticatedApiBase,
} from "@/lib/api-server/normalize-api-base";
import { supabase } from "@/lib/supabase";

async function buildAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function postLifecycleApi<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const base = resolveAuthenticatedApiBase();
  if (!base) {
    throw new Error("VITE_API_SERVER_URL is not configured");
  }
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: await buildAuthHeaders(),
    credentials: "include",
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    message?: string;
    code?: string;
  };
  if (!response.ok) {
    const err = new Error(payload.message ?? payload.error ?? `Request failed (${response.status})`);
    (err as Error & { code?: string }).code = payload.error ?? payload.code;
    throw err;
  }
  return payload;
}

export type WhatsAppLifecycleEvent = {
  id: string;
  action: string;
  status: string;
  from_company_id: string | null;
  to_company_id: string | null;
  phone_number_id: string | null;
  business_account_id: string | null;
  created_at: string;
  error_code?: string | null;
  error_message?: string | null;
};

export function disconnectWhatsAppConnection(input: {
  companyId: string;
  confirmPhoneNumberId?: string | null;
  confirmText: string;
}) {
  return postLifecycleApi<{
    ok: true;
    action: "disconnect";
    phoneNumberId: string | null;
    eventId: string | null;
  }>("/whatsapp/disconnect", input);
}

export function transferWhatsAppConnection(input: {
  companyId: string;
  toCompanyId: string;
  confirmPhoneNumberId: string;
  confirmText: string;
}) {
  return postLifecycleApi<{
    ok: true;
    action: "transfer";
    fromCompanyId: string;
    toCompanyId: string;
    phoneNumberId: string | null;
    eventId: string | null;
  }>("/whatsapp/transfer", {
    companyId: input.companyId,
    toCompanyId: input.toCompanyId,
    confirmPhoneNumberId: input.confirmPhoneNumberId,
    confirmText: input.confirmText,
  });
}

export function fetchWhatsAppLifecycleEvents(companyId: string, limit = 20) {
  return postLifecycleApi<{ events: WhatsAppLifecycleEvent[] }>("/whatsapp/lifecycle-events", {
    companyId,
    limit,
  });
}

export function isWhatsAppLifecycleApiConfigured(): boolean {
  return isAuthenticatedApiConfigured();
}
