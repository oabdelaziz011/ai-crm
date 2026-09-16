export type EmailEncryption = "none" | "starttls" | "ssl";

export type EmailInboundProvider = "imap" | "webhook" | "microsoft_graph" | "gmail_api";

export type EmailOutboundProvider = "smtp" | "microsoft_graph" | "gmail_api";

export type EmailMailboxProvider = "gmail" | "microsoft_365" | "imap_smtp";

export type EmailConnectionStatus =
  | "connected"
  | "connecting"
  | "needs_reauthorization"
  | "connection_error"
  | "disabled";

export type SmtpConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  encryption: EmailEncryption;
  fromEmail: string;
  fromName: string;
};

export type EmailMessageAttachment = {
  filename: string;
  content: Uint8Array;
  contentType: string;
};

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailMessageAttachment[];
};

export type EmailTransportSendResult = {
  messageId: string | null;
  accepted: string[];
  rejected: string[];
};

export type EmailTransportHealthResult = {
  ok: boolean;
  provider: string;
  latencyMs: number;
  error?: string;
};

/** Transport port — SMTP today; SendGrid/Mailgun/SES/Postmark later. */
export interface EmailTransport {
  readonly provider: string;
  send(message: EmailMessage, config: SmtpConfig): Promise<EmailTransportSendResult>;
  healthCheck(config: SmtpConfig): Promise<EmailTransportHealthResult>;
}

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
  templateKey: string;
};

export type EmailDeliveryResult = {
  queueId: string;
  notificationId: string | null;
  companyId: string;
  provider: string;
  status: "completed" | "failed";
  durationMs: number;
  attempts: number;
  lastError: string | null;
  recipientEmail: string | null;
  subject: string | null;
  timestamp: string;
};

export type CompanyEmailSettings = {
  companyId: string;
  enabled: boolean;
  conversationEnabled: boolean;
  inboundProvider: EmailInboundProvider;
  outboundProvider: EmailOutboundProvider;
  mailboxProvider: EmailMailboxProvider;
  connectionStatus: EmailConnectionStatus;
  connectionLastError: string;
  connectionLastSyncedAt: string | null;
  smtpHost: string;
  smtpPort: number;
  smtpUsername: string;
  smtpPassword: string;
  smtpEncryption: EmailEncryption;
  imapHost: string;
  imapPort: number;
  imapUsername: string;
  imapPassword: string;
  imapEncryption: EmailEncryption;
  fromEmail: string;
  fromName: string;
  replyToEmail: string;
  maxRetryCount: number;
  maxAttachmentBytes: number;
  imapMailbox: string;
  imapLastUid: number;
  imapPollIntervalSeconds: number;
  oauthProvider: string | null;
  oauthToken: string;
  oauthExpiresAt: string | null;
  hasSmtpPassword: boolean;
  hasImapPassword: boolean;
  hasOauthToken: boolean;
  updatedAt?: string;
};

export type EmailSettingsDraft = Omit<
  CompanyEmailSettings,
  | "companyId"
  | "hasSmtpPassword"
  | "hasImapPassword"
  | "hasOauthToken"
  | "updatedAt"
  | "imapLastUid"
  | "connectionLastSyncedAt"
  | "oauthExpiresAt"
>;

export const EMAIL_PROVIDER = "smtp" as const;

export const DEFAULT_MAX_RETRY_COUNT = 3;

export const EMAIL_RETRY_BACKOFF_MS = [0, 30_000, 120_000, 300_000] as const;
