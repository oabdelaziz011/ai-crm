import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";
import type { EmailChannelConfiguration } from "./email-config.js";
import type { EmailSmtpSendPayload, EmailSmtpSendResult } from "./email-types.js";
import { normalizeEmailMessageId } from "./email-html-utils.js";

export type EmailSmtpClientOptions = {
  loadNodemailer?: () => Promise<typeof import("nodemailer")>;
};

export class EmailSmtpClient {
  private readonly loadNodemailer: () => Promise<typeof import("nodemailer")>;

  constructor(options: EmailSmtpClientOptions = {}) {
    this.loadNodemailer =
      options.loadNodemailer ??
      (async () => import("nodemailer") as Promise<typeof import("nodemailer")>);
  }

  async send(config: EmailChannelConfiguration, payload: EmailSmtpSendPayload): Promise<EmailSmtpSendResult> {
    const nodemailer = await this.loadNodemailer();
    const transporter = nodemailer.createTransport(this.buildTransportOptions(config));

    const references =
      payload.references?.map((item) => `<${normalizeEmailMessageId(item)}>`).join(" ") || undefined;

    const result = (await transporter.sendMail({
      from: config.fromName ? `"${config.fromName}" <${config.fromEmail}>` : config.fromEmail,
      to: payload.to,
      replyTo: payload.replyTo ?? config.replyToEmail ?? config.fromEmail,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      inReplyTo: payload.inReplyTo ? `<${normalizeEmailMessageId(payload.inReplyTo)}>` : undefined,
      references,
      attachments: (payload.attachments ?? []).map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.mimeType,
        path: attachment.url,
      })),
    })) as SMTPTransport.SentMessageInfo;

    const messageId = normalizeEmailMessageId(result.messageId ?? `generated-${Date.now()}@valueor.local`);

    return {
      messageId,
      accepted: result.accepted?.map(String) ?? [],
      rejected: result.rejected?.map(String) ?? [],
      providerResponse: {
        response: result.response,
        envelope: result.envelope,
      },
    };
  }

  async verify(config: EmailChannelConfiguration): Promise<{ ok: boolean; error?: string; latencyMs: number }> {
    const started = Date.now();
    try {
      const nodemailer = await this.loadNodemailer();
      const transporter = nodemailer.createTransport(this.buildTransportOptions(config));
      await transporter.verify();
      return { ok: true, latencyMs: Date.now() - started };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private buildTransportOptions(config: EmailChannelConfiguration) {
    const secure = config.smtpEncryption === "ssl";
    return {
      host: config.smtpHost,
      port: config.smtpPort,
      secure,
      auth: config.smtpUsername
        ? {
            user: config.smtpUsername,
            pass: config.smtpPassword,
          }
        : undefined,
      requireTLS: config.smtpEncryption === "starttls",
      tls: config.smtpEncryption === "none" ? { rejectUnauthorized: false } : undefined,
    };
  }
}

export function createEmailSmtpClient(options?: EmailSmtpClientOptions): EmailSmtpClient {
  return new EmailSmtpClient(options);
}
