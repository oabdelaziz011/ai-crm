import {
  isAuthenticatedApiConfigured,
  resolveAuthenticatedApiBase,
} from "@/lib/api-server/normalize-api-base";
import { supabase } from "@/lib/supabase";
import type { MetaConnectionStatus } from "./meta-instagram-login-client";

export type MetaMessengerLoginReadiness = {
  ready: boolean;
  companyAllowed: boolean;
  reason: string | null;
  /** Env var names still required (never secret values). */
  missingConfigKeys?: string[];
  redirectUri?: string;
  scopes?: string[];
  graphApiVersion?: string;
};

export type MetaMessengerLoginConnection = {
  status: MetaConnectionStatus;
  pageId: string | null;
  pageName: string | null;
  webhookSubscriptionStatus: string | null;
  lastError: string | null;
  enabled: boolean;
  hasAccessToken: boolean;
  credentialSource?: "manual" | "oauth";
  tokenExpiresAt?: string | null;
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

export function fetchMetaMessengerLoginStatus(companyId: string): Promise<MetaMessengerLoginReadiness> {
  return apiJson("GET", `/meta/messenger-oauth/status?companyId=${encodeURIComponent(companyId)}`);
}

export function fetchMetaMessengerLoginConnection(
  companyId: string,
): Promise<MetaMessengerLoginConnection> {
  return apiJson(
    "GET",
    `/meta/messenger-oauth/connection?companyId=${encodeURIComponent(companyId)}`,
  );
}

export function startMetaMessengerLogin(
  companyId: string,
  options?: { confirmReplaceExisting?: boolean },
): Promise<{
  authorizeUrl: string;
  state: string;
  redirectUri: string;
  scopes: string[];
}> {
  return apiJson("POST", "/meta/messenger-oauth/start", {
    companyId,
    confirmReplaceExisting: Boolean(options?.confirmReplaceExisting),
  });
}

export function fetchPendingMessengerPages(
  companyId: string,
  state: string,
): Promise<{ pages: Array<{ pageId: string; name: string }> }> {
  return apiJson(
    "GET",
    `/meta/messenger-oauth/pending-pages?companyId=${encodeURIComponent(companyId)}&state=${encodeURIComponent(state)}`,
  );
}

export function completeMetaMessengerLogin(input: {
  companyId: string;
  state: string;
  pageId: string;
  webhookVerifyToken?: string;
  confirmReplaceExisting?: boolean;
}): Promise<{
  ok: true;
  pageId: string;
  pageName: string;
  connected: boolean;
  connectionStatus: MetaConnectionStatus;
  message: string;
  /** Present once after complete — paste into Meta App Dashboard webhook verify token. */
  webhookVerifyToken?: string;
}> {
  return apiJson("POST", "/meta/messenger-oauth/complete", input);
}

export function disconnectMetaMessengerLogin(
  companyId: string,
  options?: { confirmClearCredentials?: boolean },
): Promise<{
  ok: true;
  softDisconnected: true;
  metaRevoked: boolean;
  clearedCredentials?: boolean;
  softDisableOnly?: boolean;
}> {
  return apiJson("POST", "/meta/messenger-oauth/disconnect", {
    companyId,
    confirmClearCredentials: Boolean(options?.confirmClearCredentials),
  });
}

export function isMetaMessengerLoginUiEnabled(): boolean {
  const raw = String(import.meta.env.VITE_META_MESSENGER_OAUTH_ENABLED ?? "").trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (import.meta.env.VITE_META_MESSENGER_OAUTH_ENABLED === undefined) {
    const pages = String(import.meta.env.VITE_META_PAGES_OAUTH_ENABLED ?? "")
      .trim()
      .toLowerCase();
    return pages === "1" || pages === "true" || pages === "yes" || pages === "on";
  }
  return false;
}
