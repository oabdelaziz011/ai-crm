import {
  isAuthenticatedApiConfigured,
  resolveAuthenticatedApiBase,
} from "@/lib/api-server/normalize-api-base";
import { supabase } from "@/lib/supabase";

async function buildAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function postEmbeddedSignupApi<T>(path: string, body: Record<string, unknown>): Promise<T> {
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

export type WhatsAppEmbeddedSignupSessionResponse = {
  enabled: true;
  appId: string;
  configId: string;
  state: string;
  graphApiVersion: string;
  coexistenceEnabled: boolean;
  featureType: "whatsapp_business_app_onboarding" | null;
};

export type WhatsAppEmbeddedSignupCompleteResponse = {
  ok: true;
  phoneNumberId: string;
  businessAccountId: string;
  onboardingMethod: "embedded_signup";
  subscription: {
    attempted: boolean;
    reason?: string;
    ok?: boolean;
    error?: string;
  };
  connectionTestOk: boolean | null;
};

export function createWhatsAppEmbeddedSignupSession(companyId: string) {
  return postEmbeddedSignupApi<WhatsAppEmbeddedSignupSessionResponse>(
    "/whatsapp/embedded-signup/session",
    { companyId },
  );
}

export function completeWhatsAppEmbeddedSignup(input: {
  companyId: string;
  code: string;
  state: string;
  phoneNumberId: string;
  businessAccountId: string;
  businessPortfolioId?: string | null;
  replaceExisting?: boolean;
  coexistenceEligible?: boolean | null;
}) {
  return postEmbeddedSignupApi<WhatsAppEmbeddedSignupCompleteResponse>(
    "/whatsapp/embedded-signup/complete",
    input,
  );
}

export function fetchWhatsAppEmbeddedSignupStatus(companyId: string) {
  return postEmbeddedSignupApi<{
    enabled: true;
    row: Record<string, unknown> | null;
  }>("/whatsapp/embedded-signup/status", { companyId });
}

export function isWhatsAppEmbeddedSignupApiConfigured(): boolean {
  return isAuthenticatedApiConfigured();
}
