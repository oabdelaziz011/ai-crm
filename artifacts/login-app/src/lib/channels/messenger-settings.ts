import { supabase } from "@/lib/supabase";

export type CompanyMessengerSettings = {
  companyId: string;
  enabled: boolean;
  provider: "meta_messenger";
  pageId: string;
  accessToken: string;
  webhookVerifyToken: string;
  apiVersion: string;
  appSecret: string;
  hasAccessToken: boolean;
  hasWebhookVerifyToken: boolean;
  hasAppSecret: boolean;
  updatedAt?: string;
};

export type MessengerOutboundHealthResponse = {
  ok: boolean;
  latencyMs: number;
  error?: string;
  metaErrorCode?: number;
  pageId: string;
  accessToken: {
    valid: boolean;
    ownerId?: string;
    ownerName?: string;
  };
  page: {
    ok: boolean;
    name?: string;
    error?: string;
  };
  sendProbe: {
    ok: boolean;
    error?: string;
  };
};

export type MessengerSettingsDraft = Omit<
  CompanyMessengerSettings,
  "companyId" | "hasAccessToken" | "hasWebhookVerifyToken" | "hasAppSecret" | "updatedAt"
>;

function mapPublicRecord(record: Record<string, unknown>): CompanyMessengerSettings {
  return {
    companyId: String(record.company_id),
    enabled: Boolean(record.enabled),
    provider: "meta_messenger",
    pageId: String(record.page_id ?? ""),
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

export async function fetchMessengerSettings(companyId: string): Promise<CompanyMessengerSettings> {
  const { data, error } = await supabase.rpc("get_company_messenger_settings", {
    p_company_id: companyId,
  });
  if (error) throw new Error(error.message);
  return mapPublicRecord(data as Record<string, unknown>);
}

export async function upsertMessengerSettings(
  companyId: string,
  settings: MessengerSettingsDraft,
): Promise<CompanyMessengerSettings> {
  const { data, error } = await supabase.rpc("upsert_company_messenger_settings", {
    p_company_id: companyId,
    p_enabled: settings.enabled,
    p_provider: settings.provider,
    p_page_id: settings.pageId,
    p_access_token: settings.accessToken,
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

async function postMessengerApi<T>(path: string, body: Record<string, unknown>): Promise<T> {
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
    throw new Error(payload.message ?? payload.error ?? `Messenger API failed (${response.status})`);
  }
  return payload;
}

export function isMessengerApiConfigured(): boolean {
  return Boolean(getApiBaseUrl());
}

export function fetchMessengerOutboundHealth(
  companyId: string,
  companyChannelId: string,
): Promise<MessengerOutboundHealthResponse> {
  return postMessengerApi<MessengerOutboundHealthResponse>("/messenger/channel-outbound-health", {
    companyId,
    companyChannelId,
  });
}
