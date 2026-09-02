import { supabase } from "@/lib/supabase";
import {
  isAuthenticatedApiConfigured,
  resolveAuthenticatedApiBase,
} from "@/lib/api-server/normalize-api-base";

async function buildAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function mapWhatsAppNetworkError(error: unknown, base: string): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(message)) {
    return new Error(
      `Cannot reach WhatsApp API at ${base}. Check that VITE_API_SERVER_URL is online (api-server running) and reachable from this browser.`,
    );
  }
  return error instanceof Error ? error : new Error(message);
}

async function postWhatsAppApi<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const base = resolveAuthenticatedApiBase();
  if (!base) {
    throw new Error("VITE_API_SERVER_URL is not configured");
  }

  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: await buildAuthHeaders(),
      credentials: "include",
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw mapWhatsAppNetworkError(error, base);
  }

  let payload: T & { error?: string; message?: string };
  try {
    payload = (await response.json()) as T & { error?: string; message?: string };
  } catch {
    throw new Error(`WhatsApp API returned non-JSON (${response.status}) from ${base}${path}`);
  }
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

export type WhatsAppConnectionTestResponse = {
  ok: boolean;
  latencyMs: number;
  error?: string;
  metaErrorCode?: number;
  metaErrorSubcode?: number;
  tokenStatus: "valid" | "expired" | "invalid" | "unknown" | "missing";
  tokenExpiresAt: string | null;
  accessToken: { ok: boolean; error?: string; ownerId?: string; ownerName?: string };
  phoneNumber: {
    ok: boolean;
    error?: string;
    id?: string;
    displayPhoneNumber?: string;
    verifiedName?: string;
    owningWabaId?: string | null;
  };
  businessAccount: {
    ok: boolean;
    error?: string;
    id?: string;
    name?: string;
    phoneNumberBelongsToWaba?: boolean;
  };
  mismatch?: {
    configuredPhoneNumberId: string;
    configuredWabaId: string | null;
    actualWabaIdFromMeta: string | null;
    incorrectValue: "phone_number_id" | "waba_id" | "access_token" | "unknown";
    wabaPhoneNumberIds?: string[];
    detail: string;
  };
  diagnostics?: {
    tokenSource: string;
    tokenFrom: string;
    phoneNumberId: string | null;
    checkedAt: string;
    tokenFingerprint: {
      present: boolean;
      length: number;
      prefix: string | null;
      sha256_12: string | null;
    };
  };
};

export function fetchWhatsAppHealth(companyId: string): Promise<WhatsAppHealthResponse> {
  return postWhatsAppApi<WhatsAppHealthResponse>("/whatsapp/health", { companyId });
}

export function testWhatsAppConnection(companyId: string): Promise<WhatsAppConnectionTestResponse> {
  return postWhatsAppApi<WhatsAppConnectionTestResponse>("/whatsapp/test-connection", {
    companyId,
  });
}

export function sendWhatsAppTestMessage(companyId: string, recipientPhone: string) {
  return postWhatsAppApi("/whatsapp/test-message", { companyId, recipientPhone });
}

export function processWhatsAppQueue(companyId: string) {
  return postWhatsAppApi("/whatsapp/process-queue", { companyId });
}

export function isWhatsAppApiConfigured(): boolean {
  return isAuthenticatedApiConfigured();
}
