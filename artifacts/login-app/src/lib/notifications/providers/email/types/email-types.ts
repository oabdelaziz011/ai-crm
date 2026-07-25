export type EmailEncryption = "none" | "starttls" | "ssl";

export type SmtpConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  encryption: EmailEncryption;
  fromEmail: string;
  fromName: string;
};

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
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
  smtpHost: string;
  smtpPort: number;
  smtpUsername: string;
  smtpPassword: string;
  smtpEncryption: EmailEncryption;
  fromEmail: string;
  fromName: string;
  maxRetryCount: number;
  hasPassword: boolean;
  updatedAt?: string;
};

export const EMAIL_PROVIDER = "smtp" as const;

export const DEFAULT_MAX_RETRY_COUNT = 3;

export const EMAIL_RETRY_BACKOFF_MS = [0, 30_000, 120_000, 300_000] as const;
