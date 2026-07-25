import type {
  EmailMessage,
  EmailTransport,
  EmailTransportHealthResult,
  EmailTransportSendResult,
  SmtpConfig,
} from "@/lib/notifications/providers/email/types/email-types";

export type { EmailTransport } from "@/lib/notifications/providers/email/types/email-types";

/**
 * Node-only SMTP transport. Import only from server/worker contexts.
 * Browser builds should use the email API client instead.
 */
export class SmtpEmailTransport implements EmailTransport {
  readonly provider = "smtp";

  async send(message: EmailMessage, config: SmtpConfig): Promise<EmailTransportSendResult> {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport(this.buildTransportOptions(config));

    const result = await transporter.sendMail({
      from: config.fromName ? `"${config.fromName}" <${config.fromEmail}>` : config.fromEmail,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    return {
      messageId: result.messageId ?? null,
      accepted: result.accepted?.map(String) ?? [],
      rejected: result.rejected?.map(String) ?? [],
    };
  }

  async healthCheck(config: SmtpConfig): Promise<EmailTransportHealthResult> {
    const started = Date.now();
    try {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.createTransport(this.buildTransportOptions(config));
      await transporter.verify();
      return {
        ok: true,
        provider: this.provider,
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      return {
        ok: false,
        provider: this.provider,
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private buildTransportOptions(config: SmtpConfig) {
    const secure = config.encryption === "ssl";
    return {
      host: config.host,
      port: config.port,
      secure,
      auth: config.username
        ? {
            user: config.username,
            pass: config.password,
          }
        : undefined,
      requireTLS: config.encryption === "starttls",
      tls: config.encryption === "none" ? { rejectUnauthorized: false } : undefined,
    };
  }
}
