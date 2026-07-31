import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CompanyWhatsAppSettings,
  WhatsAppProviderKind,
} from "@/lib/notifications/providers/whatsapp/types/whatsapp-types";

type SettingsRow = {
  company_id: string;
  enabled: boolean;
  provider: WhatsAppProviderKind;
  access_token: string;
  phone_number_id: string;
  business_account_id: string;
  webhook_verify_token: string;
  api_version: string;
  default_language: string;
  max_retry_count: number;
  updated_at: string;
};

function mapSettings(row: SettingsRow, maskSecrets = true): CompanyWhatsAppSettings {
  return {
    companyId: row.company_id,
    enabled: row.enabled,
    provider: row.provider,
    accessToken: maskSecrets && row.access_token ? "********" : row.access_token,
    phoneNumberId: row.phone_number_id,
    businessAccountId: row.business_account_id,
    webhookVerifyToken: maskSecrets && row.webhook_verify_token ? "********" : row.webhook_verify_token,
    apiVersion: row.api_version || "v21.0",
    appSecret: "",
    defaultLanguage: row.default_language,
    maxRetryCount: row.max_retry_count,
    hasAccessToken: Boolean(row.access_token),
    hasWebhookVerifyToken: Boolean(row.webhook_verify_token),
    hasAppSecret: false,
    updatedAt: row.updated_at,
  };
}

function mapPublicRecord(record: Record<string, unknown>): CompanyWhatsAppSettings {
  return {
    companyId: String(record.company_id),
    enabled: Boolean(record.enabled),
    provider: (record.provider as WhatsAppProviderKind) ?? "meta_cloud",
    accessToken: String(record.access_token ?? ""),
    phoneNumberId: String(record.phone_number_id ?? ""),
    businessAccountId: String(record.business_account_id ?? ""),
    webhookVerifyToken: String(record.webhook_verify_token ?? ""),
    apiVersion: String(record.api_version ?? "v21.0"),
    appSecret: String(record.app_secret ?? ""),
    defaultLanguage: String(record.default_language ?? "en"),
    maxRetryCount: Number(record.max_retry_count ?? 3),
    hasAccessToken: Boolean(record.has_access_token),
    hasWebhookVerifyToken: Boolean(record.has_webhook_verify_token),
    hasAppSecret: Boolean(record.has_app_secret),
    updatedAt: record.updated_at ? String(record.updated_at) : undefined,
  };
}

export class WhatsAppSettingsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getPublic(companyId: string): Promise<CompanyWhatsAppSettings> {
    const { data, error } = await this.client.rpc("get_company_whatsapp_settings", {
      p_company_id: companyId,
    });
    if (error) throw new Error(error.message);
    return mapPublicRecord(data as Record<string, unknown>);
  }

  /** Server-side only — includes plaintext secrets. */
  async getSecure(companyId: string): Promise<CompanyWhatsAppSettings | null> {
    const { data, error } = await this.client
      .from("company_whatsapp_settings")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;
    return mapSettings(data as SettingsRow, false);
  }

  async upsert(
    companyId: string,
    settings: Omit<
      CompanyWhatsAppSettings,
      "companyId" | "hasAccessToken" | "hasWebhookVerifyToken" | "hasAppSecret" | "updatedAt"
    >,
  ): Promise<CompanyWhatsAppSettings> {
    const { data, error } = await this.client.rpc("upsert_company_whatsapp_settings", {
      p_company_id: companyId,
      p_enabled: settings.enabled,
      p_provider: settings.provider,
      p_access_token: settings.accessToken,
      p_phone_number_id: settings.phoneNumberId,
      p_business_account_id: settings.businessAccountId,
      p_webhook_verify_token: settings.webhookVerifyToken,
      p_default_language: settings.defaultLanguage,
      p_max_retry_count: settings.maxRetryCount,
      p_api_version: settings.apiVersion,
      p_app_secret: settings.appSecret,
    });
    if (error) throw new Error(error.message);
    return mapPublicRecord(data as Record<string, unknown>);
  }
}
