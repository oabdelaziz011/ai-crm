export type EmailChannelReferences = {
  fromEmail?: string;
  replyToEmail?: string;
  credentialsSource?: string;
};

export type EmailChannelConfiguration = {
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
  maxAttachmentBytes?: number;
  inboundProvider?: string;
  outboundProvider?: string;
  conversationEnabled?: boolean;
  enabled?: boolean;
};

export function parseEmailChannelReferences(
  configuration: Record<string, unknown>,
): EmailChannelReferences {
  return {
    fromEmail:
      typeof configuration.fromEmail === "string" ? configuration.fromEmail.trim() : undefined,
    replyToEmail:
      typeof configuration.replyToEmail === "string" ? configuration.replyToEmail.trim() : undefined,
    credentialsSource:
      typeof configuration.credentialsSource === "string"
        ? configuration.credentialsSource.trim()
        : undefined,
  };
}
