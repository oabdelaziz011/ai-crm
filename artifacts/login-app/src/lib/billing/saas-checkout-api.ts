import { supabase } from "@/lib/supabase";
import {
  isAuthenticatedApiConfigured,
  resolveAuthenticatedApiBase,
} from "@/lib/api-server/normalize-api-base";

const PENDING_STORAGE_KEY = "valueor_saas_checkout_pending";

export type SaasCheckoutCreateResponse = {
  ok: boolean;
  idempotentReplay?: boolean;
  sessionId: string;
  provider: string;
  amount: number | string;
  currency: string;
  status: string;
  checkoutUrl: string;
  expiresAt?: string;
  providerSessionId?: string;
  error?: string;
  message?: string;
};

export type BillingCheckoutSessionRow = {
  id: string;
  company_id: string;
  status: string;
  amount: number | string;
  currency: string;
  settled_at: string | null;
  billing_payment_id: string | null;
  settlement_code: string | null;
  failure_code: string | null;
  failure_message: string | null;
  expires_at: string | null;
  provider_code: string;
};

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export function isSaasCheckoutApiConfigured(): boolean {
  return isAuthenticatedApiConfigured();
}

export async function createSaasCheckoutSession(input: {
  returnUrl: string;
  cancelUrl?: string;
  idempotencyKey?: string;
}): Promise<SaasCheckoutCreateResponse> {
  const base = resolveAuthenticatedApiBase();
  if (!base) {
    throw new Error("API_SERVER_NOT_CONFIGURED");
  }

  const response = await fetch(`${base}/billing/saas/checkout`, {
    method: "POST",
    headers: await authHeaders(),
    credentials: "include",
    body: JSON.stringify({
      returnUrl: input.returnUrl,
      cancelUrl: input.cancelUrl ?? input.returnUrl,
      idempotencyKey: input.idempotencyKey ?? null,
      // Intentionally omit amount/currency/companyId — server is authoritative
    }),
  });

  const body = (await response.json()) as SaasCheckoutCreateResponse;
  if (!response.ok) {
    const err = new Error(body.message || body.error || "Checkout failed");
    (err as Error & { code?: string }).code = body.error;
    throw err;
  }
  return body;
}

export function storePendingCheckoutSession(sessionId: string): void {
  try {
    sessionStorage.setItem(
      PENDING_STORAGE_KEY,
      JSON.stringify({ sessionId, savedAt: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}

export function readPendingCheckoutSession(): string | null {
  try {
    const raw = sessionStorage.getItem(PENDING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { sessionId?: string };
    return parsed.sessionId ?? null;
  } catch {
    return null;
  }
}

export function clearPendingCheckoutSession(): void {
  try {
    sessionStorage.removeItem(PENDING_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export async function fetchBillingCheckoutSession(
  sessionId: string,
): Promise<BillingCheckoutSessionRow | null> {
  const { data, error } = await supabase
    .from("billing_checkout_sessions")
    .select(
      "id, company_id, status, amount, currency, settled_at, billing_payment_id, settlement_code, failure_code, failure_message, expires_at, provider_code",
    )
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as BillingCheckoutSessionRow | null;
}

export type PortalPaymentReturnState =
  | "processing"
  | "confirmed"
  | "failed"
  | "canceled"
  | "expired"
  | "unknown";

export function derivePortalPaymentReturnState(
  session: BillingCheckoutSessionRow | null,
): PortalPaymentReturnState {
  if (!session) return "unknown";
  if (session.settled_at || session.status === "succeeded") {
    return session.billing_payment_id ? "confirmed" : "processing";
  }
  if (session.status === "failed") return "failed";
  if (session.status === "canceled") return "canceled";
  if (session.status === "expired") return "expired";
  if (session.status === "pending" || session.status === "created") return "processing";
  return "unknown";
}

/** Absolute return URL for provider hosted checkout (no amount/status trust params). */
export function buildSaasPaymentReturnUrl(origin: string): string {
  const url = new URL("/dashboard/company", origin);
  url.searchParams.set("tab", "subscription");
  url.searchParams.set("payment_return", "1");
  return url.toString();
}
