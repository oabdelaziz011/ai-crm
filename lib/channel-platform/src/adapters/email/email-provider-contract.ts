/**
 * Canonical mailbox provider contract for ValueOR Email.
 * Workspace/UI consume mailboxProvider + capabilities — never provider-specific fields.
 */

import type { ParsedInboundEmail, EmailSmtpSendPayload, EmailSmtpSendResult } from "./email-types.js";
import type { EmailChannelConfiguration } from "./email-config.js";

/** UX / channel identity — one Email Workspace for all. */
export type EmailMailboxProvider = "gmail" | "microsoft_365" | "imap_smtp";

export type EmailConnectionStatus =
  | "connected"
  | "connecting"
  | "needs_reauthorization"
  | "connection_error"
  | "disabled";

export type EmailProviderCapabilities = {
  supportsOAuth: boolean;
  supportsImap: boolean;
  supportsSmtp: boolean;
  supportsAttachments: boolean;
  supportsFolders: boolean;
  supportsReadState: boolean;
  supportsThreading: boolean;
  supportsPolling: boolean;
  /** Microsoft Graph / Gmail API style fetch when IMAP is not used. */
  supportsApiFetch: boolean;
  supportsApiSend: boolean;
};

export type EmailProviderPreset = {
  mailboxProvider: EmailMailboxProvider;
  labelKey: string;
  smtpHost: string;
  smtpPort: number;
  smtpEncryption: "none" | "starttls" | "ssl";
  imapHost: string;
  imapPort: number;
  imapEncryption: "none" | "starttls" | "ssl";
  inboundProviderDefault: "imap" | "webhook" | "gmail_api" | "microsoft_graph";
  outboundProviderDefault: "smtp" | "gmail_api" | "microsoft_graph";
  authMode: "app_password" | "oauth" | "password";
};

/**
 * Normalized inbound shape for pipeline injection.
 * Aligns with ParsedInboundEmail; provider ids stay in metadata only.
 */
export type NormalizedEmailMessage = {
  id: string;
  providerMessageId: string;
  threadId: string | null;
  messageId: string;
  inReplyTo: string | null;
  references: string[];
  from: { email: string; name?: string };
  to: Array<{ email: string; name?: string }>;
  cc: Array<{ email: string; name?: string }>;
  bcc: Array<{ email: string; name?: string }>;
  subject: string;
  textBody: string;
  htmlBody: string | null;
  attachments: Array<{
    attachmentId: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    content?: Buffer;
    url?: string;
  }>;
  receivedAt: string | null;
  sentAt: string | null;
  isRead: boolean | null;
  direction: "inbound" | "outbound";
  metadata: Record<string, unknown>;
};

export type EmailProviderTestResult = {
  ok: boolean;
  stage: "incoming" | "outgoing" | "full" | "oauth";
  latencyMs: number;
  /** Safe, user-facing code — never raw provider secrets. */
  errorCode?: string;
};

export type EmailOutboundTransport = {
  send(
    config: EmailChannelConfiguration,
    payload: EmailSmtpSendPayload,
  ): Promise<EmailSmtpSendResult>;
  testConnection?(config: EmailChannelConfiguration): Promise<EmailProviderTestResult>;
};

export type EmailInboundFetcher = {
  fetchNewMessages(input: {
    config: EmailChannelConfiguration;
    cursor?: string | number;
    mailbox?: string;
  }): Promise<{ messages: ParsedInboundEmail[]; nextCursor: string | number }>;
};

/** Resolve capabilities without scattering `if (provider === "gmail")` in the workspace. */
export function resolveEmailProviderCapabilities(
  mailboxProvider: EmailMailboxProvider,
): EmailProviderCapabilities {
  switch (mailboxProvider) {
    case "gmail":
      return {
        supportsOAuth: false, // App Password IMAP/SMTP path today; API OAuth later.
        supportsImap: true,
        supportsSmtp: true,
        supportsAttachments: true,
        supportsFolders: true,
        supportsReadState: true,
        supportsThreading: true,
        supportsPolling: true,
        supportsApiFetch: false,
        supportsApiSend: false,
      };
    case "microsoft_365":
      return {
        supportsOAuth: true,
        supportsImap: false, // Do not use Basic Auth IMAP for M365.
        supportsSmtp: false,
        supportsAttachments: true,
        supportsFolders: true,
        supportsReadState: true,
        supportsThreading: true,
        supportsPolling: true,
        supportsApiFetch: true,
        supportsApiSend: true,
      };
    case "imap_smtp":
    default:
      return {
        supportsOAuth: false,
        supportsImap: true,
        supportsSmtp: true,
        supportsAttachments: true,
        supportsFolders: true,
        supportsReadState: true,
        supportsThreading: true,
        supportsPolling: true,
        supportsApiFetch: false,
        supportsApiSend: false,
      };
  }
}

export const EMAIL_PROVIDER_PRESETS: Record<EmailMailboxProvider, EmailProviderPreset> = {
  gmail: {
    mailboxProvider: "gmail",
    labelKey: "emailProvider.gmail",
    smtpHost: "smtp.gmail.com",
    smtpPort: 587,
    smtpEncryption: "starttls",
    imapHost: "imap.gmail.com",
    imapPort: 993,
    imapEncryption: "ssl",
    inboundProviderDefault: "imap",
    outboundProviderDefault: "smtp",
    authMode: "app_password",
  },
  microsoft_365: {
    mailboxProvider: "microsoft_365",
    labelKey: "emailProvider.microsoft365",
    smtpHost: "",
    smtpPort: 587,
    smtpEncryption: "starttls",
    imapHost: "",
    imapPort: 993,
    imapEncryption: "ssl",
    inboundProviderDefault: "microsoft_graph",
    outboundProviderDefault: "microsoft_graph",
    authMode: "oauth",
  },
  imap_smtp: {
    mailboxProvider: "imap_smtp",
    labelKey: "emailProvider.imapSmtp",
    smtpHost: "",
    smtpPort: 587,
    smtpEncryption: "starttls",
    imapHost: "",
    imapPort: 993,
    imapEncryption: "ssl",
    inboundProviderDefault: "imap",
    outboundProviderDefault: "smtp",
    authMode: "password",
  },
};

/**
 * Deterministic backfill: infer mailbox provider from existing settings.
 * Fail closed to imap_smtp when ambiguous (preserves current behavior).
 */
export function inferMailboxProvider(input: {
  oauthProvider?: string | null;
  inboundProvider?: string | null;
  outboundProvider?: string | null;
  smtpHost?: string | null;
  imapHost?: string | null;
  mailboxProvider?: string | null;
}): EmailMailboxProvider {
  const explicit = String(input.mailboxProvider ?? "").trim().toLowerCase();
  if (explicit === "gmail" || explicit === "microsoft_365" || explicit === "imap_smtp") {
    return explicit;
  }
  const oauth = String(input.oauthProvider ?? "").trim().toLowerCase();
  if (oauth === "microsoft" || oauth === "microsoft_365" || oauth === "azure_ad") {
    return "microsoft_365";
  }
  if (
    input.inboundProvider === "microsoft_graph" ||
    input.outboundProvider === "microsoft_graph"
  ) {
    return "microsoft_365";
  }
  if (input.inboundProvider === "gmail_api" || input.outboundProvider === "gmail_api") {
    return "gmail";
  }
  const smtp = String(input.smtpHost ?? "").trim().toLowerCase();
  const imap = String(input.imapHost ?? "").trim().toLowerCase();
  if (smtp.includes("gmail.com") || imap.includes("gmail.com")) {
    return "gmail";
  }
  if (
    smtp.includes("office365.com") ||
    smtp.includes("outlook.com") ||
    imap.includes("office365.com") ||
    imap.includes("outlook.com")
  ) {
    // Historical IMAP hostnames — treat as generic unless OAuth is present.
    // Do not auto-promote to microsoft_365 Graph without OAuth.
    return "imap_smtp";
  }
  return "imap_smtp";
}

export function parsedInboundToNormalized(
  parsed: ParsedInboundEmail,
  extras?: { providerMessageId?: string; threadId?: string | null; isRead?: boolean | null },
): NormalizedEmailMessage {
  return {
    id: parsed.messageId,
    providerMessageId: extras?.providerMessageId ?? parsed.messageId,
    threadId: extras?.threadId ?? null,
    messageId: parsed.messageId,
    inReplyTo: parsed.inReplyTo ?? null,
    references: parsed.references ?? [],
    from: parsed.from,
    to: parsed.to ?? [],
    cc: parsed.cc ?? [],
    bcc: [],
    subject: parsed.subject ?? "",
    textBody: parsed.textPlain ?? "",
    htmlBody: parsed.htmlSanitized ?? parsed.htmlOriginal ?? null,
    attachments: (parsed.attachments ?? []).map((a) => ({
      attachmentId: a.attachmentId,
      filename: a.filename,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      content: a.content,
      url: a.url,
    })),
    receivedAt: parsed.receivedAt ?? null,
    sentAt: null,
    isRead: extras?.isRead ?? null,
    direction: "inbound",
    metadata: {
      uid: parsed.uid,
      authenticationResults: parsed.authenticationResults,
    },
  };
}

/** Safe user-facing error codes (map to i18n in API/UI). */
export const EMAIL_PROVIDER_ERROR_CODES = {
  CONNECT_FAILED: "email_provider.connect_failed",
  AUTH_INVALID: "email_provider.auth_invalid",
  OAUTH_EXPIRED: "email_provider.oauth_expired",
  SERVER_REJECTED: "email_provider.server_rejected",
  SEND_FAILED: "email_provider.send_failed",
  NOT_CONFIGURED: "email_provider.not_configured",
  OAUTH_NOT_CONFIGURED: "email_provider.oauth_not_configured",
} as const;

export type EmailProviderErrorCode =
  (typeof EMAIL_PROVIDER_ERROR_CODES)[keyof typeof EMAIL_PROVIDER_ERROR_CODES];
