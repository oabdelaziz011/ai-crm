/**
 * Client-safe mailbox provider presets (hosts/ports only — no secrets).
 * Mirrors channel-platform EMAIL_PROVIDER_PRESETS for the settings UI.
 */
import type {
  EmailEncryption,
  EmailInboundProvider,
  EmailMailboxProvider,
  EmailOutboundProvider,
} from "@/lib/notifications/providers/email/types/email-types";

export const EMAIL_MAILBOX_PROVIDER_PRESETS: Record<
  EmailMailboxProvider,
  {
    smtpHost: string;
    smtpPort: number;
    smtpEncryption: EmailEncryption;
    imapHost: string;
    imapPort: number;
    imapEncryption: EmailEncryption;
    inboundProvider: EmailInboundProvider;
    outboundProvider: EmailOutboundProvider;
  }
> = {
  gmail: {
    smtpHost: "smtp.gmail.com",
    smtpPort: 587,
    smtpEncryption: "starttls",
    imapHost: "imap.gmail.com",
    imapPort: 993,
    imapEncryption: "ssl",
    inboundProvider: "imap",
    outboundProvider: "smtp",
  },
  microsoft_365: {
    smtpHost: "",
    smtpPort: 587,
    smtpEncryption: "starttls",
    imapHost: "",
    imapPort: 993,
    imapEncryption: "ssl",
    inboundProvider: "microsoft_graph",
    outboundProvider: "microsoft_graph",
  },
  imap_smtp: {
    smtpHost: "",
    smtpPort: 587,
    smtpEncryption: "starttls",
    imapHost: "",
    imapPort: 993,
    imapEncryption: "ssl",
    inboundProvider: "imap",
    outboundProvider: "smtp",
  },
};
