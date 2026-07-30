import { supabase } from "@/lib/supabase";

export type CompanyInstagramSettings = {
  companyId: string;
  enabled: boolean;
  provider: "meta_instagram";
  pageId: string;
  instagramBusinessAccountId: string;
  accessToken: string;
  webhookVerifyToken: string;
  apiVersion: string;
  appSecret: string;
  hasAccessToken: boolean;
  hasWebhookVerifyToken: boolean;
  hasAppSecret: boolean;
  updatedAt?: string;
};

export type InstagramOutboundHealthResponse = {
  ok: boolean;
  latencyMs: number;
  error?: string;
  metaErrorCode?: number;
  instagramBusinessAccountId: string;
  pageId: string | null;
  accessToken: {
    valid: boolean;
    ownerId?: string;
    ownerName?: string;
  };
  instagramAccount: {
    ok: boolean;
    username?: string;
    name?: string;
    error?: string;
  };
  sendProbe: {
    ok: boolean;
    error?: string;
  };
};

export type InstagramSettingsDraft = Omit<
  CompanyInstagramSettings,
  "companyId" | "hasAccessToken" | "hasWebhookVerifyToken" | "hasAppSecret" | "updatedAt"
>;

function mapPublicRecord(record: Record<string, unknown>): CompanyInstagramSettings {
  return {
    companyId: String(record.company_id),
    enabled: Boolean(record.enabled),
    provider: "meta_instagram",
    pageId: String(record.page_id ?? ""),
    instagramBusinessAccountId: String(record.instagram_business_account_id ?? ""),
    accessToken: String(record.access_token ?? ""),
    webhookVerifyToken: String(record.webhook_verify_token ?? ""),
    apiVersion: String(record.api_version ?? "v21.0"),
    appSecret: String(record.app_secret ?? ""),
    hasAccessToken: Boolean(record.has_access_token),
    hasWebhookVerifyToken: Boolean(record.has_webhook_verify_token),
    hasAppSecret: Boolean(record.has_app_secret),
    updatedAt: record.updated_at ? String(record.updated_at) : undefined,
  };
}

export async function fetchInstagramSettings(companyId: string): Promise<CompanyInstagramSettings> {
  const { data, error } = await supabase.rpc("get_company_instagram_settings", {
    p_company_id: companyId,
  });
  if (error) throw new Error(error.message);
  return mapPublicRecord(data as Record<string, unknown>);
}

export async function upsertInstagramSettings(
  companyId: string,
  settings: InstagramSettingsDraft,
): Promise<CompanyInstagramSettings> {
  const { data, error } = await supabase.rpc("upsert_company_instagram_settings", {
    p_company_id: companyId,
    p_enabled: settings.enabled,
    p_provider: settings.provider,
    p_access_token: settings.accessToken,
    p_page_id: settings.pageId,
    p_instagram_business_account_id: settings.instagramBusinessAccountId,
    p_webhook_verify_token: settings.webhookVerifyToken,
    p_api_version: settings.apiVersion,
    p_app_secret: settings.appSecret,
  });
  if (error) throw new Error(error.message);
  return mapPublicRecord(data as Record<string, unknown>);
}

function getApiBaseUrl(): string {
  const runtimeEnv = import.meta.env as Record<string, string | undefined>;
  return (runtimeEnv.VITE_API_SERVER_URL?.trim() ?? "").replace(/\/$/, "");
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

async function postInstagramApi<T>(path: string, body: Record<string, unknown>): Promise<T> {
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
    throw new Error(payload.message ?? payload.error ?? `Instagram API failed (${response.status})`);
  }
  return payload;
}

export function isInstagramApiConfigured(): boolean {
  return Boolean(getApiBaseUrl());
}

export function fetchInstagramOutboundHealth(
  companyId: string,
  companyChannelId: string,
): Promise<InstagramOutboundHealthResponse> {
  return postInstagramApi<InstagramOutboundHealthResponse>("/instagram/channel-outbound-health", {
    companyId,
    companyChannelId,
  });
}
