import { supabase } from "@/lib/supabase";
import {
  isAuthenticatedApiConfigured,
  resolveAuthenticatedApiBase,
} from "@/lib/api-server/normalize-api-base";
import type {
  CompanySmsSettings,
  SmsConnectionTestResponse,
  SmsProviderKind,
  SmsSettingsDraft,
} from "./sms-settings-types";
import { DEFAULT_INFOBIP_BASE_URL } from "./sms-settings-types";

export type {
  CompanySmsSettings,
  SmsConnectionTestResponse,
  SmsProviderKind,
  SmsSettingsDraft,
} from "./sms-settings-types";
export { DEFAULT_INFOBIP_BASE_URL } from "./sms-settings-types";
export { resolveSmsConnectionStatus } from "./sms-settings-status";

function mapProvider(raw: unknown): SmsProviderKind {
  const value = String(raw ?? "").trim();
  if (value === "twilio" || value === "infobip") return value;
  return "";
}

function mapPublicRecord(record: Record<string, unknown>): CompanySmsSettings {
  return {
    companyId: String(record.company_id),
    enabled: Boolean(record.enabled),
    provider: mapProvider(record.provider),
    accountSid: String(record.account_sid ?? ""),
    fromNumber: String(record.from_number ?? ""),
    authToken: String(record.auth_token ?? ""),
    hasAuthToken: Boolean(record.has_auth_token),
    apiKey: String(record.api_key ?? ""),
    hasApiKey: Boolean(record.has_api_key),
    baseUrl: String(record.base_url ?? ""),
    updatedAt: record.updated_at ? String(record.updated_at) : undefined,
  };
}

export async function fetchSmsSettings(companyId: string): Promise<CompanySmsSettings> {
  const { data, error } = await supabase.rpc("get_company_sms_settings", {
    p_company_id: companyId,
  });
  if (error) throw new Error(error.message);
  return mapPublicRecord(data as Record<string, unknown>);
}

export async function upsertSmsSettings(
  companyId: string,
  settings: SmsSettingsDraft,
): Promise<CompanySmsSettings> {
  const { data, error } = await supabase.rpc("upsert_company_sms_settings", {
    p_company_id: companyId,
    p_enabled: settings.enabled,
    p_provider: settings.provider,
    p_account_sid: settings.accountSid,
    p_from_number: settings.fromNumber,
    p_auth_token: settings.authToken,
    p_api_key: settings.apiKey,
    p_base_url: settings.baseUrl || (settings.provider === "infobip" ? DEFAULT_INFOBIP_BASE_URL : ""),
  });
  if (error) throw new Error(error.message);
  return mapPublicRecord(data as Record<string, unknown>);
}

function getApiBaseUrl(): string {
  return resolveAuthenticatedApiBase();
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

export function isSmsApiConfigured(): boolean {
  return isAuthenticatedApiConfigured();
}

export async function testSmsConnection(companyId: string): Promise<SmsConnectionTestResponse> {
  const base = getApiBaseUrl();
  if (!base) {
    throw new Error("VITE_API_SERVER_URL is not configured");
  }

  const response = await fetch(`${base}/sms/test-connection`, {
    method: "POST",
    headers: await buildAuthHeaders(),
    credentials: "include",
    body: JSON.stringify({ companyId }),
  });

  const payload = (await response.json()) as SmsConnectionTestResponse & {
    error?: string;
    message?: string;
  };
  if (!response.ok && payload.ok !== false) {
    throw new Error(payload.message ?? payload.error ?? `SMS API failed (${response.status})`);
  }
  return payload;
}
