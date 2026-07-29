import type {
  ChannelAdapterContext,
  ChannelAdapterPort,
  ChannelAdapterSendResult,
} from "../../ports/channel-adapter-port.js";
import type {
  ChannelAttachmentDto,
  NormalizedInboundMessageDto,
  OutboundChannelMessageDto,
  WebhookEnvelopeDto,
} from "../../dto/channel-dto.js";
import { AttachmentEngine } from "../../engines/attachment-engine.js";
import { ValidationError } from "../../errors.js";
import { EmailSmtpClient } from "./email-smtp-client.js";
import { parseEmailChannelReferences } from "./email-config.js";
import { resolveEmailRuntimeConfiguration } from "./email-canonical-credentials.js";
import type { EmailCredentialsLoader } from "./email-canonical-credentials.js";
import { buildEmailReferencesHeader } from "./email-thread-resolver.js";
import { buildReplySubject } from "./email-html-utils.js";
import type { EmailSmtpSendPayload } from "./email-types.js";

export type EmailCloudAdapterOptions = {
  credentialsLoader?: EmailCredentialsLoader;
  smtpClient?: EmailSmtpClient;
  onOutboundDiagnostic?: (detail: Record<string, unknown>) => void;
};

export class EmailCloudAdapter implements ChannelAdapterPort {
  readonly channelKey = "email";

  private readonly attachmentEngine = new AttachmentEngine();
  private readonly credentialsLoader?: EmailCredentialsLoader;
  private readonly smtpClient: EmailSmtpClient;
  private readonly onOutboundDiagnostic?: (detail: Record<string, unknown>) => void;

  constructor(options: EmailCloudAdapterOptions = {}) {
    this.credentialsLoader = options.credentialsLoader;
    this.smtpClient = options.smtpClient ?? new EmailSmtpClient();
    this.onOutboundDiagnostic = options.onOutboundDiagnostic;
  }

  parseWebhookEvents(_ctx: ChannelAdapterContext, rawPayload: Record<string, unknown>): WebhookEnvelopeDto[] {
    const messages = Array.isArray(rawPayload.messages)
      ? (rawPayload.messages as Record<string, unknown>[])
      : [rawPayload];

    return messages
      .map((message) => this.toEnvelope(message))
      .filter((envelope): envelope is WebhookEnvelopeDto => envelope !== null);
  }

  parseWebhook(ctx: ChannelAdapterContext, rawPayload: Record<string, unknown>): WebhookEnvelopeDto {
    const envelopes = this.parseWebhookEvents(ctx, rawPayload);
    const primary = envelopes[0];
    if (!primary) {
      throw new ValidationError("Email webhook payload did not contain routable events.");
    }
    return primary;
  }

  normalizeInbound(_ctx: ChannelAdapterContext, payload: Record<string, unknown>): NormalizedInboundMessageDto {
    const messageId =
      typeof payload.messageId === "string"
        ? payload.messageId
        : typeof payload.externalMessageId === "string"
          ? payload.externalMessageId
          : "";

    const externalThreadId =
      typeof payload.resolvedExternalThreadId === "string"
        ? payload.resolvedExternalThreadId
        : typeof payload.externalThreadId === "string"
          ? payload.externalThreadId
          : messageId;

    const senderExternalId =
      typeof payload.senderExternalId === "string"
        ? payload.senderExternalId
        : payload.from && typeof payload.from === "object"
          ? String((payload.from as Record<string, unknown>).email ?? "")
          : null;

    const textPlain =
      typeof payload.textPlain === "string"
        ? payload.textPlain.trim()
        : typeof payload.text === "string"
          ? payload.text.trim()
          : "";

    const attachments = this.attachmentEngine.normalizeAttachments(payload.attachments);

    return {
      externalThreadId,
      externalMessageId: messageId,
      senderExternalId,
      text: textPlain,
      attachments,
      metadata: {
        channel: "email",
        subject: typeof payload.subject === "string" ? payload.subject : undefined,
        htmlOriginal: typeof payload.htmlOriginal === "string" ? payload.htmlOriginal : undefined,
        htmlSanitized: typeof payload.htmlSanitized === "string" ? payload.htmlSanitized : undefined,
        inReplyTo: typeof payload.inReplyTo === "string" ? payload.inReplyTo : undefined,
        references: Array.isArray(payload.references) ? payload.references : [],
        from: payload.from,
        to: payload.to,
        authenticationResults: payload.authenticationResults,
      },
    };
  }

  formatOutbound(_ctx: ChannelAdapterContext, message: OutboundChannelMessageDto): Record<string, unknown> {
    const metadata = message.metadata ?? {};
    const recipientEmail =
      typeof metadata.recipientEmail === "string"
        ? metadata.recipientEmail
        : typeof metadata.senderExternalId === "string"
          ? metadata.senderExternalId
          : "";

    if (!recipientEmail.trim()) {
      throw new ValidationError("Email outbound requires recipientEmail metadata.");
    }

    const subject =
      typeof metadata.emailSubject === "string"
        ? metadata.emailSubject
        : buildReplySubject(typeof metadata.subject === "string" ? metadata.subject : "");

    const references = buildEmailReferencesHeader({
      threadRootMessageId: message.externalThreadId,
      priorReferences: Array.isArray(metadata.emailReferences)
        ? metadata.emailReferences.map(String)
        : undefined,
      inReplyTo: typeof metadata.inReplyTo === "string" ? metadata.inReplyTo : undefined,
    });

    const payload: EmailSmtpSendPayload = {
      to: recipientEmail,
      subject,
      text: message.text,
      html: typeof metadata.htmlSanitized === "string" ? metadata.htmlSanitized : undefined,
      inReplyTo: typeof metadata.inReplyTo === "string" ? metadata.inReplyTo : undefined,
      references,
      attachments: this.formatAttachments(message.attachments),
    };

    return { payload, recipientEmail, externalThreadId: message.externalThreadId };
  }

  async sendOutbound(
    ctx: ChannelAdapterContext,
    formattedPayload: Record<string, unknown>,
  ): Promise<ChannelAdapterSendResult> {
    if (!this.credentialsLoader) {
      throw new ValidationError("Email credentials loader is not configured.");
    }

    const channelReferences = parseEmailChannelReferences(ctx.companyChannel.configuration);
    const runtimeConfig = await resolveEmailRuntimeConfiguration(
      ctx.companyChannel.companyId,
      channelReferences,
      this.credentialsLoader,
    );

    this.onOutboundDiagnostic?.({
      stage: "outbound.credentials.resolved",
      companyId: ctx.companyChannel.companyId,
      companyChannelId: ctx.companyChannel.id,
      fromEmail: runtimeConfig.fromEmail,
      credentialSource: "company_email_settings",
    });

    const payload = formattedPayload.payload as EmailSmtpSendPayload;
    const response = await this.smtpClient.send(runtimeConfig, {
      ...payload,
      replyTo: runtimeConfig.replyToEmail ?? runtimeConfig.fromEmail,
    });

    if (!response.messageId) {
      throw new ValidationError("SMTP provider did not return an outbound Message-ID.");
    }

    return {
      externalMessageId: response.messageId,
      providerResponse: response.providerResponse ?? { accepted: response.accepted, rejected: response.rejected },
    };
  }

  private toEnvelope(message: Record<string, unknown>): WebhookEnvelopeDto | null {
    if (message.kind && message.kind !== "email.inbound") {
      return null;
    }

    const messageId =
      typeof message.messageId === "string"
        ? message.messageId
        : typeof message.externalMessageId === "string"
          ? message.externalMessageId
          : "";

    if (!messageId.trim()) return null;

    const externalThreadId =
      typeof message.resolvedExternalThreadId === "string"
        ? message.resolvedExternalThreadId
        : messageId;

    const senderExternalId =
      typeof message.senderExternalId === "string"
        ? message.senderExternalId
        : message.from && typeof message.from === "object"
          ? String((message.from as Record<string, unknown>).email ?? "")
          : undefined;

    return {
      eventType: "message.received",
      companyChannelId: "",
      channelKey: this.channelKey,
      idempotencyKey: `email:${messageId}`,
      externalThreadId,
      externalMessageId: messageId,
      payload: {
        ...message,
        senderExternalId,
      },
    };
  }

  private formatAttachments(attachments?: ChannelAttachmentDto[]): EmailSmtpSendPayload["attachments"] {
    if (!attachments?.length) return [];
    return attachments.map((attachment) => ({
      filename: attachment.filename ?? attachment.attachmentId,
      mimeType: attachment.mimeType,
      url: attachment.url,
    }));
  }
}

export function createEmailCloudAdapter(options?: EmailCloudAdapterOptions): EmailCloudAdapter {
  return new EmailCloudAdapter(options);
}
