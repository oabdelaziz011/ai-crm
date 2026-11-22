import {
  isAuthenticatedApiConfigured,
  resolveAuthenticatedApiBase,
} from "@/lib/api-server/normalize-api-base";
import { supabase } from "@/lib/supabase";

export type MetaPagesOauthChannel = "messenger" | "instagram";

export type MetaPagesOauthReadiness = {
  ready: boolean;
  companyAllowed: boolean;
  reason: "MPO_DISABLED" | "MPO_COMPANY_NOT_ALLOWED" | "MPO_META_CONFIG_MISSING" | null;
};

export type MetaPagesOauthSession = {
  enabled: true;
  appId: string;
  state: string;
  graphApiVersion: string;
  channel: MetaPagesOauthChannel;
  scopes: string[];
};

export type MetaPageAssetPublic = {
  pageId: string;
  name: string;
  instagramBusinessAccountId?: string | null;
  instagramUsername?: string | null;
};

export type MetaPagesOauthCompleteResult = {
  ok: true;
  channel: MetaPagesOauthChannel;
  pageId: string;
  instagramBusinessAccountId?: string | null;
  connected: boolean;
  healthOk: boolean | null;
  message: string;
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

export function fetchMetaPagesOauthStatus(companyId: string): Promise<MetaPagesOauthReadiness> {
  return apiJson("GET", `/meta/pages-oauth/status?companyId=${encodeURIComponent(companyId)}`);
}

export function createMetaPagesOauthSession(input: {
  companyId: string;
  channel: MetaPagesOauthChannel;
}): Promise<MetaPagesOauthSession> {
  return apiJson("POST", "/meta/pages-oauth/session", input);
}

export function discoverMetaPageAssets(input: {
  companyId: string;
  channel: MetaPagesOauthChannel;
  code: string;
  state: string;
}): Promise<{ pages: MetaPageAssetPublic[] }> {
  return apiJson("POST", "/meta/pages-oauth/assets", input);
}

export function completeMetaPagesOauth(input: {
  companyId: string;
  channel: MetaPagesOauthChannel;
  code: string;
  state: string;
  pageId: string;
  instagramBusinessAccountId?: string | null;
  webhookVerifyToken?: string | null;
}): Promise<MetaPagesOauthCompleteResult> {
  return apiJson("POST", "/meta/pages-oauth/complete", input);
}

export function disconnectMetaPagesOauth(input: {
  companyId: string;
  channel: MetaPagesOauthChannel;
}): Promise<{ ok: true; softDisconnected: true; metaRevoked: false }> {
  return apiJson("POST", "/meta/pages-oauth/disconnect", input);
}
