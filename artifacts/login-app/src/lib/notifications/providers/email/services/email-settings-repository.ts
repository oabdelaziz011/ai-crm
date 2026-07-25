import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompanyEmailSettings, EmailEncryption } from "@/lib/notifications/providers/email/types/email-types";

type SettingsRow = {
  company_id: string;
  enabled: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password: string;
  smtp_encryption: EmailEncryption;
  from_email: string;
  from_name: string;
  max_retry_count: number;
  updated_at: string;
};

function mapSettings(row: SettingsRow, maskPassword = true): CompanyEmailSettings {
  return {
    companyId: row.company_id,
    enabled: row.enabled,
    smtpHost: row.smtp_host,
    smtpPort: row.smtp_port,
    smtpUsername: row.smtp_username,
    smtpPassword: maskPassword && row.smtp_password ? "********" : row.smtp_password,
    smtpEncryption: row.smtp_encryption,
    fromEmail: row.from_email,
    fromName: row.from_name,
    maxRetryCount: row.max_retry_count,
    hasPassword: Boolean(row.smtp_password),
    updatedAt: row.updated_at,
  };
}

export class EmailSettingsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getPublic(companyId: string): Promise<CompanyEmailSettings> {
    const { data, error } = await this.client.rpc("get_company_email_settings", {
      p_company_id: companyId,
    });
    if (error) throw new Error(error.message);
    const record = data as Record<string, unknown>;
    return {
      companyId: String(record.company_id),
      enabled: Boolean(record.enabled),
      smtpHost: String(record.smtp_host ?? ""),
      smtpPort: Number(record.smtp_port ?? 587),
      smtpUsername: String(record.smtp_username ?? ""),
      smtpPassword: String(record.smtp_password ?? ""),
      smtpEncryption: (record.smtp_encryption as EmailEncryption) ?? "starttls",
      fromEmail: String(record.from_email ?? ""),
      fromName: String(record.from_name ?? ""),
      maxRetryCount: Number(record.max_retry_count ?? 3),
      hasPassword: Boolean(record.has_password),
      updatedAt: record.updated_at ? String(record.updated_at) : undefined,
    };
  }

  /** Server-side only — includes plaintext password. */
  async getSecure(companyId: string): Promise<CompanyEmailSettings | null> {
    const { data, error } = await this.client
      .from("company_email_settings")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;
    return mapSettings(data as SettingsRow, false);
  }

  async upsert(
    companyId: string,
    settings: Omit<CompanyEmailSettings, "companyId" | "hasPassword" | "updatedAt">,
  ): Promise<CompanyEmailSettings> {
    const { data, error } = await this.client.rpc("upsert_company_email_settings", {
      p_company_id: companyId,
      p_enabled: settings.enabled,
      p_smtp_host: settings.smtpHost,
      p_smtp_port: settings.smtpPort,
      p_smtp_username: settings.smtpUsername,
      p_smtp_password: settings.smtpPassword,
      p_smtp_encryption: settings.smtpEncryption,
      p_from_email: settings.fromEmail,
      p_from_name: settings.fromName,
      p_max_retry_count: settings.maxRetryCount,
    });
    if (error) throw new Error(error.message);
    const record = data as Record<string, unknown>;
    return {
      companyId: String(record.company_id),
      enabled: Boolean(record.enabled),
      smtpHost: String(record.smtp_host ?? ""),
      smtpPort: Number(record.smtp_port ?? 587),
      smtpUsername: String(record.smtp_username ?? ""),
      smtpPassword: String(record.smtp_password ?? ""),
      smtpEncryption: (record.smtp_encryption as EmailEncryption) ?? "starttls",
      fromEmail: String(record.from_email ?? ""),
      fromName: String(record.from_name ?? ""),
      maxRetryCount: Number(record.max_retry_count ?? 3),
      hasPassword: Boolean(record.has_password),
      updatedAt: record.updated_at ? String(record.updated_at) : undefined,
    };
  }
}
