import type { SupabaseClient } from "@supabase/supabase-js";
import { ValidationError } from "../../errors.js";
import { assertChannelSettingsEnabled } from "../../webhooks/webhook-channel-guards.js";
import type { EmailChannelConfiguration, EmailChannelReferences } from "./email-config.js";

export const EMAIL_CREDENTIALS_SOURCE = "company_email_settings" as const;

export type EmailCanonicalCredentials = {
  fromEmail: string;
  fromName: string;
  replyToEmail?: string;
  smtpHost: string;
  smtpPort: number;
  smtpUsername: string;
  smtpPassword: string;
  smtpEncryption: "none" | "starttls" | "ssl";
  imapHost?: string;
  imapPort?: number;
  imapUsername?: string;
  imapPassword?: string;
  imapEncryption?: "none" | "starttls" | "ssl";
  imapMailbox?: string;
  imapLastUid?: number;
  maxAttachmentBytes?: number;
  inboundProvider?: string;
  outboundProvider?: string;
  mailboxProvider?: string;
  connectionStatus?: string;
  /** Server-only OAuth access token — never serialize to browser responses. */
  oauthAccessToken?: string;
  oauthRefreshToken?: string;
  oauthProvider?: string | null;
  oauthExpiresAt?: string | null;
  conversationEnabled?: boolean;
  enabled?: boolean;
};

export type EmailCredentialsLoader = {
  loadByCompanyId(companyId: string): Promise<EmailCanonicalCredentials | null>;
};

type DecryptedSettingsRow = {
  enabled?: boolean;
  conversation_enabled?: boolean;
  inbound_provider?: string;
  outbound_provider?: string;
  mailbox_provider?: string;
  connection_status?: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_username?: string;
  smtp_password?: string;
  smtp_encryption?: string;
  imap_host?: string;
  imap_port?: number;
  imap_username?: string;
  imap_password?: string;
  imap_encryption?: string;
  imap_mailbox?: string;
  imap_last_uid?: number;
  max_attachment_bytes?: number;
  from_email?: string;
  from_name?: string;
  reply_to_email?: string;
  oauth_provider?: string | null;
  oauth_token?: string;
  oauth_refresh_token?: string;
  oauth_expires_at?: string | null;
};

export async function loadCompanyEmailCredentialsDecrypted(
  client: SupabaseClient,
  companyId: string,
): Promise<EmailCanonicalCredentials | null> {
  const { data: decrypted, error: rpcError } = await client.rpc(
    "get_company_email_settings_decrypted",
    { p_company_id: companyId },
  );

  const rpcRecord =
    decrypted && typeof decrypted === "object" ? (decrypted as DecryptedSettingsRow & Record<string, unknown>) : null;

  if (!rpcError && rpcRecord) {
    return mapDecryptedSettings(rpcRecord);
  }

  const { data: row, error: tableError } = await client
    .from("company_email_settings")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();

  if (tableError || !row) {
    return null;
  }

  const settingsRow = row as DecryptedSettingsRow & {
    smtp_password_encrypted?: unknown;
  };

  if (!settingsRow.smtp_password?.trim() && settingsRow.smtp_password_encrypted && rpcError) {
    return null;
  }

  return mapDecryptedSettings({
    enabled: settingsRow.enabled,
    conversation_enabled: settingsRow.conversation_enabled,
    inbound_provider: settingsRow.inbound_provider,
    outbound_provider: settingsRow.outbound_provider,
    smtp_host: settingsRow.smtp_host ?? "",
    smtp_port: settingsRow.smtp_port ?? 587,
    smtp_username: settingsRow.smtp_username ?? "",
    smtp_password: settingsRow.smtp_password ?? "",
    smtp_encryption: settingsRow.smtp_encryption ?? "starttls",
    imap_host: settingsRow.imap_host ?? "",
    imap_port: settingsRow.imap_port ?? 993,
    imap_username: settingsRow.imap_username ?? "",
    imap_password: "",
    imap_encryption: settingsRow.imap_encryption ?? "ssl",
    imap_mailbox: settingsRow.imap_mailbox ?? "INBOX",
    imap_last_uid: settingsRow.imap_last_uid ?? 0,
    max_attachment_bytes: settingsRow.max_attachment_bytes ?? 26214400,
    from_email: settingsRow.from_email ?? "",
    from_name: settingsRow.from_name ?? "",
    reply_to_email: settingsRow.reply_to_email ?? "",
  });
}

export function createSupabaseEmailCredentialsLoader(client: SupabaseClient): EmailCredentialsLoader {
  return {
    loadByCompanyId: (companyId) => loadCompanyEmailCredentialsDecrypted(client, companyId),
  };
}

export async function resolveEmailRuntimeConfiguration(
  companyId: string,
  channelReferences: EmailChannelReferences,
  loader: EmailCredentialsLoader,
): Promise<EmailChannelConfiguration> {
  const credentials = await loader.loadByCompanyId(companyId);
  assertChannelSettingsEnabled(
    credentials?.conversationEnabled ? { enabled: true } : credentials?.enabled ? credentials : null,
    "Email",
  );

  const outboundProvider = credentials?.outboundProvider ?? "smtp";
  if (outboundProvider === "smtp" && !credentials?.smtpHost.trim()) {
    throw new ValidationError("Email SMTP host is not configured. Update company email settings.");
  }
  if (outboundProvider === "microsoft_graph" && !credentials?.oauthAccessToken?.trim()) {
    throw new ValidationError("email_provider.oauth_expired");
  }

  const fromEmail = credentials?.fromEmail.trim() || channelReferences.fromEmail?.trim() || "";
  if (!fromEmail) {
    throw new ValidationError("Email from address is not configured.");
  }

  return {
    fromEmail,
    fromName: credentials?.fromName.trim() || "",
    replyToEmail: credentials?.replyToEmail?.trim() || channelReferences.replyToEmail?.trim() || undefined,
    smtpHost: credentials?.smtpHost.trim() || "",
    smtpPort: credentials?.smtpPort ?? 587,
    smtpUsername: credentials?.smtpUsername.trim() || "",
    smtpPassword: credentials?.smtpPassword ?? "",
    smtpEncryption: credentials?.smtpEncryption ?? "starttls",
    imapHost: credentials?.imapHost?.trim() || undefined,
    imapPort: credentials?.imapPort,
    imapUsername: credentials?.imapUsername?.trim() || undefined,
    imapPassword: credentials?.imapPassword,
    imapEncryption: credentials?.imapEncryption,
    imapMailbox: credentials?.imapMailbox,
    maxAttachmentBytes: credentials?.maxAttachmentBytes,
    inboundProvider: credentials?.inboundProvider,
    outboundProvider: credentials?.outboundProvider,
    mailboxProvider: credentials?.mailboxProvider,
    connectionStatus: credentials?.connectionStatus,
    oauthAccessToken: credentials?.oauthAccessToken,
    oauthRefreshToken: credentials?.oauthRefreshToken,
    oauthProvider: credentials?.oauthProvider,
    oauthExpiresAt: credentials?.oauthExpiresAt,
    conversationEnabled: credentials?.conversationEnabled,
    enabled: credentials?.enabled,
  };
}

function mapDecryptedSettings(row: DecryptedSettingsRow): EmailCanonicalCredentials | null {
  const fromEmail = typeof row.from_email === "string" ? row.from_email.trim() : "";
  const smtpHost = typeof row.smtp_host === "string" ? row.smtp_host.trim() : "";
  const oauthAccessToken = typeof row.oauth_token === "string" ? row.oauth_token : "";
  const outboundProvider = typeof row.outbound_provider === "string" ? row.outbound_provider : "smtp";

  // Allow Microsoft Graph credentials without SMTP host.
  if (!fromEmail && !smtpHost && !oauthAccessToken) {
    return null;
  }
  if (outboundProvider === "microsoft_graph" && !fromEmail && !oauthAccessToken) {
    return null;
  }

  return {
    fromEmail,
    fromName: typeof row.from_name === "string" ? row.from_name.trim() : "",
    replyToEmail:
      typeof row.reply_to_email === "string" && row.reply_to_email.trim()
        ? row.reply_to_email.trim()
        : undefined,
    smtpHost,
    smtpPort: typeof row.smtp_port === "number" ? row.smtp_port : 587,
    smtpUsername: typeof row.smtp_username === "string" ? row.smtp_username.trim() : "",
    smtpPassword: typeof row.smtp_password === "string" ? row.smtp_password : "",
    smtpEncryption:
      row.smtp_encryption === "none" || row.smtp_encryption === "ssl" || row.smtp_encryption === "starttls"
        ? row.smtp_encryption
        : "starttls",
    imapHost: typeof row.imap_host === "string" ? row.imap_host.trim() : undefined,
    imapPort: typeof row.imap_port === "number" ? row.imap_port : undefined,
    imapUsername: typeof row.imap_username === "string" ? row.imap_username.trim() : undefined,
    imapPassword: typeof row.imap_password === "string" ? row.imap_password : undefined,
    imapEncryption:
      row.imap_encryption === "none" || row.imap_encryption === "ssl" || row.imap_encryption === "starttls"
        ? row.imap_encryption
        : undefined,
    imapMailbox: typeof row.imap_mailbox === "string" ? row.imap_mailbox : undefined,
    imapLastUid:
      typeof row.imap_last_uid === "number"
        ? row.imap_last_uid
        : typeof row.imap_last_uid === "string" && row.imap_last_uid.trim() !== "" && Number.isFinite(Number(row.imap_last_uid))
          ? Number(row.imap_last_uid)
          : undefined,
    maxAttachmentBytes:
      typeof row.max_attachment_bytes === "number" ? row.max_attachment_bytes : undefined,
    inboundProvider: typeof row.inbound_provider === "string" ? row.inbound_provider : undefined,
    outboundProvider,
    mailboxProvider: typeof row.mailbox_provider === "string" ? row.mailbox_provider : undefined,
    connectionStatus: typeof row.connection_status === "string" ? row.connection_status : undefined,
    oauthAccessToken: oauthAccessToken || undefined,
    oauthRefreshToken:
      typeof row.oauth_refresh_token === "string" && row.oauth_refresh_token
        ? row.oauth_refresh_token
        : undefined,
    oauthProvider: row.oauth_provider ?? null,
    oauthExpiresAt: row.oauth_expires_at ?? null,
    conversationEnabled: row.conversation_enabled,
    enabled: row.enabled,
  };
}
