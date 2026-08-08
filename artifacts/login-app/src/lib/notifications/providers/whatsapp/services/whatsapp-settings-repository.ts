import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CompanyWhatsAppSettings,
  WhatsAppProviderKind,
  WhatsAppTokenStatus,
} from "@/lib/notifications/providers/whatsapp/types/whatsapp-types";

function mapTokenStatus(value: unknown): WhatsAppTokenStatus {
  const status = String(value ?? "unknown");
  if (
    status === "valid" ||
    status === "expired" ||
    status === "invalid" ||
    status === "unknown" ||
    status === "missing"
  ) {
    return status;
  }
  return "unknown";
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
    tokenStatus: mapTokenStatus(record.token_status),
    tokenExpiresAt: record.token_expires_at ? String(record.token_expires_at) : null,
    tokenCheckedAt: record.token_checked_at ? String(record.token_checked_at) : null,
    lastSuccessfulSendAt: record.last_successful_send_at
      ? String(record.last_successful_send_at)
      : null,
    lastAuthError: record.last_auth_error ? String(record.last_auth_error) : null,
    lastAuthErrorAt: record.last_auth_error_at ? String(record.last_auth_error_at) : null,
    lastAuthErrorCode:
      record.last_auth_error_code == null || record.last_auth_error_code === ""
        ? null
        : Number(record.last_auth_error_code),
    updatedAt: record.updated_at ? String(record.updated_at) : undefined,
  };
}

export type WhatsAppSettingsDraft = Omit<
  CompanyWhatsAppSettings,
  | "companyId"
  | "hasAccessToken"
  | "hasWebhookVerifyToken"
  | "hasAppSecret"
  | "updatedAt"
  | "tokenStatus"
  | "tokenExpiresAt"
  | "tokenCheckedAt"
  | "lastSuccessfulSendAt"
  | "lastAuthError"
  | "lastAuthErrorAt"
  | "lastAuthErrorCode"
>;

export class WhatsAppSettingsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getPublic(companyId: string): Promise<CompanyWhatsAppSettings> {
    const { data, error } = await this.client.rpc("get_company_whatsapp_settings", {
      p_company_id: companyId,
    });
    if (error) throw new Error(error.message);
    return mapPublicRecord(data as Record<string, unknown>);
  }

  /** Server-side only — includes plaintext secrets via decrypt RPC. */
  async getSecure(companyId: string): Promise<CompanyWhatsAppSettings | null> {
    const { data, error } = await this.client.rpc("get_company_whatsapp_settings_decrypted", {
      p_company_id: companyId,
    });
    if (error) throw new Error(error.message);
    if (!data || typeof data !== "object") return null;

    const decrypted = data as Record<string, unknown>;
    const publicSettings = await this.getPublic(companyId);
    return {
      ...publicSettings,
      accessToken: String(decrypted.access_token ?? ""),
      webhookVerifyToken: String(decrypted.webhook_verify_token ?? ""),
      appSecret: String(decrypted.app_secret ?? ""),
      phoneNumberId: String(decrypted.phone_number_id ?? publicSettings.phoneNumberId),
      businessAccountId: String(decrypted.business_account_id ?? publicSettings.businessAccountId),
      apiVersion: String(decrypted.api_version ?? publicSettings.apiVersion),
      hasAccessToken: Boolean(
        decrypted.has_access_token ?? String(decrypted.access_token ?? "").trim(),
      ),
      hasWebhookVerifyToken: Boolean(
        decrypted.has_webhook_verify_token ??
          String(decrypted.webhook_verify_token ?? "").trim(),
      ),
      hasAppSecret: Boolean(
        decrypted.has_app_secret ?? String(decrypted.app_secret ?? "").trim(),
      ),
    };
  }

  async upsert(companyId: string, settings: WhatsAppSettingsDraft): Promise<CompanyWhatsAppSettings> {
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
