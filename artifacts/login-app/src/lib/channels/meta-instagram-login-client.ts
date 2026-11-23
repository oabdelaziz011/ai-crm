import {
  isAuthenticatedApiConfigured,
  resolveAuthenticatedApiBase,
} from "@/lib/api-server/normalize-api-base";
import { supabase } from "@/lib/supabase";

export type MetaConnectionStatus =
  | "connected"
  | "not_connected"
  | "connection_expired"
  | "reauthorization_required"
  | "webhook_subscription_failed";

export type MetaInstagramLoginReadiness = {
  ready: boolean;
  companyAllowed: boolean;
  reason: string | null;
  /** Env var names still required (never secret values). */
  missingConfigKeys?: string[];
  redirectUri?: string;
  scopes?: string[];
  graphApiVersion?: string;
};

export type MetaInstagramLoginConnection = {
  status: MetaConnectionStatus;
  username: string | null;
  igUserId: string | null;
  oauthMode: string | null;
  tokenExpiresAt: string | null;
  webhookSubscriptionStatus: string | null;
  lastError: string | null;
  enabled: boolean;
  hasAccessToken: boolean;
  credentialSource?: "manual" | "oauth";
};

async function buildAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function apiJson<T>(method: "GET" | "POST", path: string, body?: Record<string, unknown>): Promise<T> {
  if (!isAuthenticatedApiConfigured()) {
    throw new Error("VITE_API_SERVER_URL is not configured");
  }
  const base = resolveAuthenticatedApiBase();
  const response = await fetch(`${base}${path}`, {
    method,
    headers: await buildAuthHeaders(),
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
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

export function fetchMetaInstagramLoginStatus(companyId: string): Promise<MetaInstagramLoginReadiness> {
  return apiJson("GET", `/meta/instagram-login/status?companyId=${encodeURIComponent(companyId)}`);
}

export function fetchMetaInstagramLoginConnection(
  companyId: string,
): Promise<MetaInstagramLoginConnection> {
  return apiJson(
    "GET",
    `/meta/instagram-login/connection?companyId=${encodeURIComponent(companyId)}`,
  );
}

export function startMetaInstagramLogin(
  companyId: string,
  options?: { confirmReplaceExisting?: boolean },
): Promise<{
  authorizeUrl: string;
  state: string;
  redirectUri: string;
  scopes: string[];
}> {
  return apiJson("POST", "/meta/instagram-login/start", {
    companyId,
    confirmReplaceExisting: Boolean(options?.confirmReplaceExisting),
  });
}

export function disconnectMetaInstagramLogin(
  companyId: string,
  options?: { confirmClearCredentials?: boolean },
): Promise<{
  ok: true;
  softDisconnected: true;
  metaRevoked: boolean;
  clearedCredentials?: boolean;
  softDisableOnly?: boolean;
}> {
  return apiJson("POST", "/meta/instagram-login/disconnect", {
    companyId,
    confirmClearCredentials: Boolean(options?.confirmClearCredentials),
  });
}

export function refreshMetaInstagramLoginToken(companyId: string): Promise<{
  ok: boolean;
  status: MetaConnectionStatus;
  tokenExpiresAt: string | null;
  message: string;
}> {
  return apiJson("POST", "/meta/instagram-login/refresh-token", { companyId });
}

export function isMetaInstagramLoginUiEnabled(): boolean {
  const raw = String(import.meta.env.VITE_META_INSTAGRAM_LOGIN_ENABLED ?? "").trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (import.meta.env.VITE_META_INSTAGRAM_LOGIN_ENABLED === undefined) {
    const pages = String(import.meta.env.VITE_META_PAGES_OAUTH_ENABLED ?? "")
      .trim()
      .toLowerCase();
    return pages === "1" || pages === "true" || pages === "yes" || pages === "on";
  }
  return false;
}
