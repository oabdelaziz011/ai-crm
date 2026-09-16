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
import { buildReplySubject, htmlToPlainText } from "./email-html-utils.js";
import type { EmailChannelConfiguration } from "./email-config.js";
import type { EmailSmtpSendPayload } from "./email-types.js";
import { MicrosoftGraphEmailClient } from "./microsoft-graph-email-client.js";
import { EMAIL_PROVIDER_ERROR_CODES } from "./email-provider-contract.js";
import { mapEmailProviderError } from "./email-provider-errors.js";

export type EmailCloudAdapterOptions = {
  credentialsLoader?: EmailCredentialsLoader;
  smtpClient?: EmailSmtpClient;
  microsoftGraphClient?: MicrosoftGraphEmailClient;
  onOutboundDiagnostic?: (detail: Record<string, unknown>) => void;
  /** Server-side Microsoft token refresh — never expose tokens to the browser. */
  refreshMicrosoftToken?: (
    config: EmailChannelConfiguration,
    companyId: string,
  ) => Promise<EmailChannelConfiguration>;
};

export class EmailCloudAdapter implements ChannelAdapterPort {
  readonly channelKey = "email";

  private readonly attachmentEngine = new AttachmentEngine();
  private readonly credentialsLoader?: EmailCredentialsLoader;
  private readonly smtpClient: EmailSmtpClient;
  private readonly microsoftGraphClient: MicrosoftGraphEmailClient;
  private readonly onOutboundDiagnostic?: (detail: Record<string, unknown>) => void;
  private readonly refreshMicrosoftToken?: EmailCloudAdapterOptions["refreshMicrosoftToken"];

  constructor(options: EmailCloudAdapterOptions = {}) {
    this.credentialsLoader = options.credentialsLoader;
    this.smtpClient = options.smtpClient ?? new EmailSmtpClient();
    this.microsoftGraphClient = options.microsoftGraphClient ?? new MicrosoftGraphEmailClient();
    this.onOutboundDiagnostic = options.onOutboundDiagnostic;
    this.refreshMicrosoftToken = options.refreshMicrosoftToken;
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

    const rawTextPlain =
      typeof payload.textPlain === "string"
        ? payload.textPlain.trim()
        : typeof payload.text === "string"
          ? payload.text.trim()
          : "";
    const htmlOriginal =
      typeof payload.htmlOriginal === "string" ? payload.htmlOriginal : undefined;
    const htmlSanitized =
      typeof payload.htmlSanitized === "string" ? payload.htmlSanitized : undefined;
    // Prefer explicit plain text; otherwise derive from HTML so HTML-only mail is valid.
    const textPlain =
      rawTextPlain ||
      (htmlSanitized ? htmlToPlainText(htmlSanitized) : "") ||
      (htmlOriginal ? htmlToPlainText(htmlOriginal) : "");

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
        htmlOriginal,
        htmlSanitized,
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
    const nestedOutbound =
      metadata.emailOutbound &&
      typeof metadata.emailOutbound === "object" &&
      !Array.isArray(metadata.emailOutbound)
        ? (metadata.emailOutbound as Record<string, unknown>)
        : null;
    const recipientEmailsRaw = Array.isArray(metadata.recipientEmails)
      ? metadata.recipientEmails
      : Array.isArray(nestedOutbound?.recipientEmails)
        ? nestedOutbound.recipientEmails
        : null;
    const recipientEmails = (recipientEmailsRaw ?? [])
      .map(String)
      .map((item) => item.trim())
      .filter(Boolean);

    const recipientEmail =
      recipientEmails[0] ??
      (typeof metadata.recipientEmail === "string"
        ? metadata.recipientEmail
        : typeof nestedOutbound?.recipientEmail === "string"
          ? nestedOutbound.recipientEmail
          : typeof metadata.senderExternalId === "string"
            ? metadata.senderExternalId
            : typeof nestedOutbound?.senderExternalId === "string"
              ? nestedOutbound.senderExternalId
              : "");

    if (!recipientEmail.trim()) {
      throw new ValidationError("Email outbound requires recipientEmail metadata.");
    }

    const smtpTo =
      recipientEmails.length > 0
        ? recipientEmails
        : recipientEmail.trim();

    const subject =
      typeof metadata.emailSubject === "string"
        ? metadata.emailSubject
        : typeof nestedOutbound?.emailSubject === "string"
          ? nestedOutbound.emailSubject
          : typeof nestedOutbound?.subject === "string"
            ? nestedOutbound.subject
            : buildReplySubject(typeof metadata.subject === "string" ? metadata.subject : "");

    const composerMode =
      typeof metadata.emailComposerMode === "string"
        ? metadata.emailComposerMode
        : typeof nestedOutbound?.emailComposerMode === "string"
          ? nestedOutbound.emailComposerMode
          : "";
    const isNewOutbound = composerMode === "compose" || composerMode === "forward";

    const inReplyTo = isNewOutbound
      ? undefined
      : typeof metadata.inReplyTo === "string"
        ? metadata.inReplyTo
        : typeof nestedOutbound?.inReplyTo === "string"
          ? nestedOutbound.inReplyTo
          : undefined;

    const references = isNewOutbound
      ? undefined
      : buildEmailReferencesHeader({
          threadRootMessageId: message.externalThreadId,
          priorReferences: Array.isArray(metadata.emailReferences)
            ? metadata.emailReferences.map(String)
            : Array.isArray(nestedOutbound?.emailReferences)
              ? nestedOutbound.emailReferences.map(String)
              : Array.isArray(nestedOutbound?.references)
                ? nestedOutbound.references.map(String)
                : undefined,
          inReplyTo,
        });

    const ccRaw = Array.isArray(metadata.cc)
      ? metadata.cc
      : Array.isArray(nestedOutbound?.cc)
        ? nestedOutbound.cc
        : [];
    const bccRaw = Array.isArray(metadata.bcc)
      ? metadata.bcc
      : Array.isArray(nestedOutbound?.bcc)
        ? nestedOutbound.bcc
        : [];
    const cc = ccRaw.map(String).map((item) => item.trim()).filter(Boolean);
    const bcc = bccRaw.map(String).map((item) => item.trim()).filter(Boolean);

    const payload: EmailSmtpSendPayload = {
      to: smtpTo,
      subject,
      text: message.text,
      html:
        typeof metadata.htmlSanitized === "string"
          ? metadata.htmlSanitized
          : typeof nestedOutbound?.htmlSanitized === "string"
            ? nestedOutbound.htmlSanitized
            : undefined,
      inReplyTo,
      references,
      cc: cc.length ? cc : undefined,
      bcc: bcc.length ? bcc : undefined,
      attachments: this.formatAttachments(message.attachments),
    };

    return { payload, recipientEmail, recipientEmails: recipientEmails.length ? recipientEmails : [recipientEmail], externalThreadId: message.externalThreadId };
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
    const attachments = await this.materializeSmtpAttachments(payload.attachments);
    const outboundProvider = runtimeConfig.outboundProvider ?? "smtp";

    this.onOutboundDiagnostic?.({
      stage: "outbound.provider.selected",
      companyId: ctx.companyChannel.companyId,
      companyChannelId: ctx.companyChannel.id,
      outboundProvider,
      mailboxProvider: runtimeConfig.mailboxProvider ?? null,
    });

    if (outboundProvider === "microsoft_graph") {
      let graphConfig = runtimeConfig;
      try {
        if (this.refreshMicrosoftToken) {
          graphConfig = await this.refreshMicrosoftToken(
            runtimeConfig,
            ctx.companyChannel.companyId,
          );
        }
      } catch (error) {
        const mapped = mapEmailProviderError(error);
        throw new ValidationError(mapped.code);
      }
      const accessToken = graphConfig.oauthAccessToken?.trim() || "";
      if (!accessToken) {
        throw new ValidationError(EMAIL_PROVIDER_ERROR_CODES.OAUTH_EXPIRED);
      }
      try {
        const response = await this.microsoftGraphClient.send(
          { accessToken, fromEmail: graphConfig.fromEmail },
          {
            ...payload,
            attachments,
            replyTo: graphConfig.replyToEmail ?? graphConfig.fromEmail,
          },
        );
        if (!response.messageId) {
          throw new ValidationError(EMAIL_PROVIDER_ERROR_CODES.SEND_FAILED);
        }
        return {
          externalMessageId: response.messageId,
          providerResponse: response.providerResponse ?? {
            accepted: response.accepted,
            rejected: response.rejected,
          },
        };
      } catch (error) {
        const mapped = mapEmailProviderError(error);
        throw new ValidationError(mapped.code);
      }
    }

    // Default + gmail / generic: SMTP (existing path).
    const response = await this.smtpClient.send(runtimeConfig, {
      ...payload,
      attachments,
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

  /**
   * Fetch attachment bytes from the reminted signed URL so SMTP sends real MIME parts.
   * Never put storage URLs in the email body.
   */
  private async materializeSmtpAttachments(
    attachments?: EmailSmtpSendPayload["attachments"],
  ): Promise<EmailSmtpSendPayload["attachments"]> {
    if (!attachments?.length) return [];
    const materialized: NonNullable<EmailSmtpSendPayload["attachments"]> = [];
    for (const attachment of attachments) {
      const filename = attachment.filename?.trim() || "attachment";
      if (attachment.content != null) {
        materialized.push({
          filename,
          mimeType: attachment.mimeType,
          content: attachment.content,
        });
        continue;
      }
      if (!attachment.url?.trim()) {
        throw new ValidationError(`Email attachment "${filename}" is missing binary content.`);
      }
      const response = await fetch(attachment.url);
      if (!response.ok) {
        throw new ValidationError(`Failed to load email attachment "${filename}".`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      materialized.push({
        filename,
        mimeType: attachment.mimeType,
        content: bytes,
      });
    }
    return materialized;
  }
}

export function createEmailCloudAdapter(options?: EmailCloudAdapterOptions): EmailCloudAdapter {
  return new EmailCloudAdapter(options);
}
