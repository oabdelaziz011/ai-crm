export type EmailTransportEncryption = "none" | "starttls" | "ssl";

export type EmailInboundProvider =
  | "imap"
  | "webhook"
  | "gmail_api"
  | "microsoft_graph"
  | "ses_inbound";

export type EmailOutboundProvider =
  | "smtp"
  | "ses"
  | "sendgrid"
  | "mailgun"
  | "gmail_api"
  | "microsoft_graph";

export type EmailAddress = {
  email: string;
  name?: string;
};

export type EmailAuthenticationResults = {
  spf?: "pass" | "fail" | "neutral" | "none" | "softfail" | "unknown";
  dkim?: "pass" | "fail" | "none" | "unknown";
  dmarc?: "pass" | "fail" | "none" | "unknown";
  raw?: Record<string, unknown>;
};

export type ParsedEmailAttachment = {
  attachmentId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  content?: Buffer;
  contentBase64?: string;
  contentRef?: string;
  url?: string;
  isInline?: boolean;
  contentId?: string;
  related?: boolean;
};

export type ParsedInboundEmail = {
  uid?: number;
  messageId: string;
  inReplyTo?: string | null;
  references: string[];
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  subject: string;
  textPlain: string;
  htmlOriginal?: string;
  htmlSanitized?: string;
  receivedAt?: string;
  attachments: ParsedEmailAttachment[];
  authenticationResults?: EmailAuthenticationResults;
  headers?: Record<string, string>;
};

export type EmailSmtpSendPayload = {
  /** Primary To — string or multiple recipients (nodemailer accepts both). */
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  inReplyTo?: string;
  references?: string[];
  /** Optional carbon-copy recipients (Reply All / Compose). */
  cc?: string[];
  /** Optional blind carbon-copy recipients (Compose). */
  bcc?: string[];
  attachments?: Array<{
    filename: string;
    mimeType?: string;
    content?: Buffer | string;
    url?: string;
  }>;
};

export type EmailSmtpSendResult = {
  messageId: string;
  accepted: string[];
  rejected: string[];
  providerResponse?: Record<string, unknown>;
};

export type EmailImapFetchResult = {
  messages: ParsedInboundEmail[];
  lastUid: number;
};
