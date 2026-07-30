import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CompanyEmailSettings,
  EmailEncryption,
  EmailInboundProvider,
  EmailOutboundProvider,
  EmailSettingsDraft,
} from "@/lib/notifications/providers/email/types/email-types";

const UNCHANGED_SECRET = "********";

function isUnchangedSecret(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === "" || trimmed === UNCHANGED_SECRET || /^\*+[A-Za-z0-9]{1,8}$/.test(trimmed);
}

function resolveSecretForUpsert(value: string, hasStored: boolean): string {
  if (isUnchangedSecret(value)) {
    return hasStored ? UNCHANGED_SECRET : "";
  }
  return value;
}

function parseEncryption(value: unknown, fallback: EmailEncryption): EmailEncryption {
  if (value === "none" || value === "starttls" || value === "ssl") return value;
  return fallback;
}

function parseInboundProvider(value: unknown): EmailInboundProvider {
  return value === "webhook" ? "webhook" : "imap";
}

function parseOutboundProvider(value: unknown): EmailOutboundProvider {
  return value === "smtp" ? "smtp" : "smtp";
}

function mapPublicRecord(record: Record<string, unknown>, companyId: string): CompanyEmailSettings {
  return {
    companyId: String(record.company_id ?? companyId),
    enabled: Boolean(record.enabled),
    conversationEnabled: Boolean(record.conversation_enabled),
    inboundProvider: parseInboundProvider(record.inbound_provider),
    outboundProvider: parseOutboundProvider(record.outbound_provider),
    smtpHost: String(record.smtp_host ?? ""),
    smtpPort: Number(record.smtp_port ?? 587),
    smtpUsername: String(record.smtp_username ?? ""),
    smtpPassword: String(record.smtp_password ?? ""),
    smtpEncryption: parseEncryption(record.smtp_encryption, "starttls"),
    imapHost: String(record.imap_host ?? ""),
    imapPort: Number(record.imap_port ?? 993),
    imapUsername: String(record.imap_username ?? ""),
    imapPassword: "",
    imapEncryption: parseEncryption(record.imap_encryption, "ssl"),
    fromEmail: String(record.from_email ?? ""),
    fromName: String(record.from_name ?? ""),
    replyToEmail: String(record.reply_to_email ?? ""),
    maxRetryCount: Number(record.max_retry_count ?? 3),
    maxAttachmentBytes: Number(record.max_attachment_bytes ?? 26_214_400),
    imapMailbox: String(record.imap_mailbox ?? "INBOX"),
    imapLastUid: Number(record.imap_last_uid ?? 0),
    imapPollIntervalSeconds: Number(record.imap_poll_interval_seconds ?? 60),
    oauthProvider: record.oauth_provider ? String(record.oauth_provider) : null,
    oauthToken: String(record.oauth_token ?? ""),
    hasSmtpPassword: Boolean(record.has_smtp_password),
    hasImapPassword: Boolean(record.has_imap_password),
    hasOauthToken: Boolean(record.has_oauth_token),
    updatedAt: record.updated_at ? String(record.updated_at) : undefined,
  };
}

export function companyEmailSettingsToDraft(settings: CompanyEmailSettings): EmailSettingsDraft {
  return {
    enabled: settings.enabled,
    conversationEnabled: settings.conversationEnabled,
    inboundProvider: settings.inboundProvider,
    outboundProvider: settings.outboundProvider,
    smtpHost: settings.smtpHost,
    smtpPort: settings.smtpPort,
    smtpUsername: settings.smtpUsername,
    smtpPassword: settings.smtpPassword,
    smtpEncryption: settings.smtpEncryption,
    imapHost: settings.imapHost,
    imapPort: settings.imapPort,
    imapUsername: settings.imapUsername,
    imapPassword: settings.imapPassword,
    imapEncryption: settings.imapEncryption,
    fromEmail: settings.fromEmail,
    fromName: settings.fromName,
    replyToEmail: settings.replyToEmail,
    maxRetryCount: settings.maxRetryCount,
    maxAttachmentBytes: settings.maxAttachmentBytes,
    imapMailbox: settings.imapMailbox,
    imapPollIntervalSeconds: settings.imapPollIntervalSeconds,
    oauthProvider: settings.oauthProvider,
    oauthToken: settings.oauthToken,
  };
}

function buildUpsertPayload(
  merged: EmailSettingsDraft,
  current: CompanyEmailSettings,
): Record<string, unknown> {
  return {
    p_enabled: merged.enabled,
    p_smtp_host: merged.smtpHost,
    p_smtp_port: merged.smtpPort,
    p_smtp_username: merged.smtpUsername,
    p_smtp_password: resolveSecretForUpsert(merged.smtpPassword, current.hasSmtpPassword),
    p_smtp_encryption: merged.smtpEncryption,
    p_from_email: merged.fromEmail,
    p_from_name: merged.fromName,
    p_max_retry_count: merged.maxRetryCount,
    p_conversation_enabled: merged.conversationEnabled,
    p_inbound_provider: merged.inboundProvider,
    p_outbound_provider: merged.outboundProvider,
    p_imap_host: merged.imapHost,
    p_imap_port: merged.imapPort,
    p_imap_username: merged.imapUsername,
    p_imap_password: resolveSecretForUpsert(merged.imapPassword, current.hasImapPassword),
    p_imap_encryption: merged.imapEncryption,
    p_reply_to_email: merged.replyToEmail,
    p_max_attachment_bytes: merged.maxAttachmentBytes,
    p_imap_mailbox: merged.imapMailbox,
    p_imap_poll_interval_seconds: merged.imapPollIntervalSeconds,
    p_oauth_provider: merged.oauthProvider,
    p_oauth_token: resolveSecretForUpsert(merged.oauthToken, current.hasOauthToken),
  };
}

export class EmailSettingsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getPublic(companyId: string): Promise<CompanyEmailSettings> {
    const { data, error } = await this.client.rpc("get_company_email_settings", {
      p_company_id: companyId,
    });
    if (error) throw new Error(error.message);
    return mapPublicRecord(data as Record<string, unknown>, companyId);
  }

  /** Server-side only — includes plaintext credentials when service role is available. */
  async getSecure(companyId: string): Promise<CompanyEmailSettings | null> {
    const { data, error } = await this.client.rpc("get_company_email_settings_decrypted", {
      p_company_id: companyId,
    });
    if (!error && data && typeof data === "object") {
      const record = data as Record<string, unknown>;
      return {
        ...mapPublicRecord(record, companyId),
        smtpPassword: String(record.smtp_password ?? ""),
        imapPassword: String(record.imap_password ?? ""),
        oauthToken: String(record.oauth_token ?? ""),
      };
    }

    const { data: row, error: tableError } = await this.client
      .from("company_email_settings")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();

    if (tableError) throw new Error(tableError.message);
    if (!row) return null;

    const record = row as Record<string, unknown>;
    return {
      ...mapPublicRecord(record, companyId),
      smtpPassword: String(record.smtp_password ?? ""),
      imapPassword: String(record.imap_password ?? ""),
      oauthToken: String(record.oauth_token ?? ""),
    };
  }

  /**
   * Loads current settings, merges user changes, and sends the full 24-parameter upsert payload.
   */
  async upsert(companyId: string, changes: Partial<EmailSettingsDraft>): Promise<CompanyEmailSettings> {
    const current = await this.getPublic(companyId);
    const merged: EmailSettingsDraft = {
      ...companyEmailSettingsToDraft(current),
      ...changes,
    };

    const { data, error } = await this.client.rpc("upsert_company_email_settings", {
      p_company_id: companyId,
      ...buildUpsertPayload(merged, current),
    });
    if (error) throw new Error(error.message);
    return mapPublicRecord(data as Record<string, unknown>, companyId);
  }
}
