import type { EmailChannelConfiguration } from "./email-config.js";
import { EmailSmtpClient } from "./email-smtp-client.js";

export type EmailOutboundHealthReport = {
  ok: boolean;
  latencyMs: number;
  error?: string;
  credentialSource: "company_email_settings";
  smtp: {
    host: string;
    port: number;
    fromEmail: string;
    verified: boolean;
    error?: string;
  };
  imap?: {
    host: string;
    port: number;
    mailbox?: string;
    configured: boolean;
  };
};

export type EmailOutboundHealthInput = {
  companyId: string;
  runtimeConfig: EmailChannelConfiguration;
  smtpClient?: EmailSmtpClient;
};

export async function performEmailOutboundHealthCheck(
  input: EmailOutboundHealthInput,
): Promise<EmailOutboundHealthReport> {
  const smtpClient = input.smtpClient ?? new EmailSmtpClient();
  const started = Date.now();
  const config = input.runtimeConfig;

  const report: EmailOutboundHealthReport = {
    ok: false,
    latencyMs: 0,
    credentialSource: "company_email_settings",
    smtp: {
      host: config.smtpHost,
      port: config.smtpPort,
      fromEmail: config.fromEmail,
      verified: false,
    },
  };

  if (config.imapHost) {
    report.imap = {
      host: config.imapHost,
      port: config.imapPort ?? 993,
      mailbox: config.imapMailbox,
      configured: true,
    };
  }

  const verify = await smtpClient.verify(config);
  report.smtp.verified = verify.ok;
  report.smtp.error = verify.error;
  report.ok = verify.ok;
  report.latencyMs = Date.now() - started;
  report.error = verify.ok ? undefined : verify.error;

  return report;
}
