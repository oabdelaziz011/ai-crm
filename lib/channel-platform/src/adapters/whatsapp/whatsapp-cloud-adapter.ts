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
import { WhatsAppApiClient, parseWhatsAppWebhookEvents } from "./whatsapp-api-client.js";
import { parseWhatsAppChannelReferences } from "./whatsapp-config.js";
import type { WhatsAppCredentialsLoader } from "./whatsapp-canonical-credentials.js";
import { resolveWhatsAppRuntimeConfiguration } from "./whatsapp-canonical-credentials.js";
import type { WhatsAppSendMessagePayload, WhatsAppWebhookMessage } from "./whatsapp-types.js";
import { validateWhatsAppInteractiveListPayload } from "./whatsapp-interactive-list-validation.js";
import { traceWhatsAppRawWebhookPayload } from "../../debug/interactive-if-trace-debug.js";

export type WhatsAppCloudAdapterOptions = {
  fetchFn?: typeof fetch;
  credentialsLoader?: WhatsAppCredentialsLoader;
  onOutboundDiagnostic?: (detail: Record<string, unknown>) => void;
};

export class WhatsAppCloudAdapter implements ChannelAdapterPort {
  readonly channelKey = "whatsapp";

  private readonly apiClient: WhatsAppApiClient;
  private readonly attachmentEngine = new AttachmentEngine();
  private readonly credentialsLoader?: WhatsAppCredentialsLoader;
  private readonly onOutboundDiagnostic?: (detail: Record<string, unknown>) => void;

  constructor(options: WhatsAppCloudAdapterOptions = {}) {
    this.credentialsLoader = options.credentialsLoader;
    this.onOutboundDiagnostic = options.onOutboundDiagnostic;
    this.apiClient = new WhatsAppApiClient({
      fetchFn: options.fetchFn,
      onOutboundRequest: (detail) => this.onOutboundDiagnostic?.(detail),
    });
  }

  parseWebhookEvents(ctx: ChannelAdapterContext, rawPayload: Record<string, unknown>): WebhookEnvelopeDto[] {
    const events = parseWhatsAppWebhookEvents(rawPayload);
    return events.map((event) => {
      if (event.kind === "status") {
        return {
          eventType: event.status === "read" ? "message.read" : "message.status",
          companyChannelId: ctx.companyChannel.id,
          channelKey: this.channelKey,
          idempotencyKey: event.idempotencyKey,
          externalThreadId: event.externalThreadId ?? "",
          externalMessageId: event.externalMessageId,
          payload: {
            deliveryStatus: event.status,
            providerResponse: event.providerResponse,
            errorMessage: event.errorMessage,
            raw: event.raw,
          },
        } satisfies WebhookEnvelopeDto;
      }

      return {
        eventType: "message.received",
        companyChannelId: ctx.companyChannel.id,
        channelKey: this.channelKey,
        idempotencyKey: event.idempotencyKey,
        externalThreadId: event.externalThreadId,
        externalMessageId: event.externalMessageId,
        payload: {
          message: event.message,
          senderExternalId: event.senderExternalId,
          senderName: event.senderName,
          phoneNumberId: event.phoneNumberId,
          raw: event.raw,
        },
      } satisfies WebhookEnvelopeDto;
    });
  }

  parseWebhook(ctx: ChannelAdapterContext, rawPayload: Record<string, unknown>): WebhookEnvelopeDto {
    const envelopes = this.parseWebhookEvents(ctx, rawPayload);
    const primary = envelopes[0];

    if (!primary) {
      throw new ValidationError("WhatsApp webhook payload did not contain routable events.");
    }

    return primary;
  }

  normalizeInbound(_ctx: ChannelAdapterContext, payload: Record<string, unknown>): NormalizedInboundMessageDto {
    traceWhatsAppRawWebhookPayload(payload);

    const message = payload.message as WhatsAppWebhookMessage | undefined;
    if (!message) {
      throw new ValidationError("WhatsApp inbound payload missing message object.");
    }

    const { text, attachments } = this.extractMessageContent(message);
    const metadata: Record<string, unknown> = {
      whatsappMessageType: message.type,
      senderName: typeof payload.senderName === "string" ? payload.senderName : undefined,
      phoneNumberId: typeof payload.phoneNumberId === "string" ? payload.phoneNumberId : undefined,
    };

    if (message.type === "interactive") {
      const buttonReply = message.interactive?.button_reply;
      const listReply = message.interactive?.list_reply;
      if (buttonReply?.id) metadata.replyId = buttonReply.id;
      if (buttonReply?.title) metadata.title = buttonReply.title;
      if (listReply?.id) metadata.replyId = listReply.id;
      if (listReply?.title) metadata.title = listReply.title;
      if (listReply?.description) metadata.description = listReply.description;
      metadata.kind = "interactive_reply";
      if (listReply) metadata.interactionType = "list_reply";
      if (buttonReply) metadata.interactionType = "button_reply";
    }

    const resolvedText =
      text.trim() ||
      (typeof metadata.title === "string" ? metadata.title.trim() : "") ||
      (typeof metadata.replyId === "string" ? metadata.replyId.trim() : "");

    return {
      externalThreadId: message.from,
      externalMessageId: message.id,
      senderExternalId: message.from,
      text: resolvedText,
      attachments,
      metadata,
    };
  }

  formatOutbound(_ctx: ChannelAdapterContext, message: OutboundChannelMessageDto): Record<string, unknown> {
    const structured =
      (message.metadata?.outboundPayload as Record<string, unknown> | undefined) ??
      undefined;
    const kind = typeof structured?.kind === "string" ? structured.kind : null;

    if (kind === "buttons" && typeof structured?.text === "string" && Array.isArray(structured.buttons)) {
      const payload: WhatsAppSendMessagePayload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: message.externalThreadId,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: structured.text },
          action: {
            buttons: (structured.buttons as Array<{ id: string; label: string }>).slice(0, 3).map((button) => ({
              type: "reply",
              reply: { id: button.id, title: button.label.slice(0, 20) },
            })),
          },
        },
      };
      return { payload, recipient: message.externalThreadId };
    }

    if (
      kind === "list" &&
      typeof structured?.title === "string" &&
      typeof structured?.body === "string" &&
      typeof structured?.buttonLabel === "string" &&
      Array.isArray(structured.sections)
    ) {
      const payload: WhatsAppSendMessagePayload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: message.externalThreadId,
        type: "interactive",
        interactive: {
          type: "list",
          header: structured.title ? { type: "text", text: structured.title } : undefined,
          body: { text: structured.body },
          action: {
            button: structured.buttonLabel.slice(0, 20),
            sections: (structured.sections as Array<{
              title: string;
              rows: Array<{ id: string; title: string; description?: string }>;
            }>).map((section) => ({
              title: section.title,
              rows: section.rows.map((row) => ({
                id: row.id,
                title: row.title,
                description: row.description,
              })),
            })),
          },
        },
      };
      validateWhatsAppInteractiveListPayload(payload);
      return { payload, recipient: message.externalThreadId };
    }

    const template = message.metadata?.whatsappTemplate as
      | { name: string; languageCode: string; components?: Array<Record<string, unknown>> }
      | undefined;

    if (template?.name) {
      const payload: WhatsAppSendMessagePayload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: message.externalThreadId,
        type: "template",
        template: {
          name: template.name,
          language: { code: template.languageCode ?? "en_US" },
          components: template.components,
        },
      };
      return { payload, recipient: message.externalThreadId };
    }

    const attachment = message.attachments?.[0];
    if (attachment) {
      const payload = this.formatMediaPayload(message.externalThreadId, attachment, message.text);
      return { payload, recipient: message.externalThreadId };
    }

    const payload: WhatsAppSendMessagePayload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: message.externalThreadId,
      type: "text",
      text: { body: message.text },
    };

    return { payload, recipient: message.externalThreadId };
  }

  async sendOutbound(
    ctx: ChannelAdapterContext,
    formattedPayload: Record<string, unknown>,
  ): Promise<ChannelAdapterSendResult> {
    if (!this.credentialsLoader) {
      throw new ValidationError("WhatsApp credentials loader is not configured.");
    }

    const channelReferences = parseWhatsAppChannelReferences(ctx.companyChannel.configuration);
    const runtimeConfig = await resolveWhatsAppRuntimeConfiguration(
      ctx.companyChannel.companyId,
      channelReferences,
      this.credentialsLoader,
    );

    this.onOutboundDiagnostic?.({
      stage: "outbound.credentials.resolved",
      companyId: ctx.companyChannel.companyId,
      companyChannelId: ctx.companyChannel.id,
      phoneNumberId: runtimeConfig.phoneNumberId,
      credentialSource: "company_whatsapp_settings",
    });

    const payload = formattedPayload.payload as WhatsAppSendMessagePayload;
    const response = await this.apiClient.sendMessage(runtimeConfig, payload, {
      accessTokenSource: "company_whatsapp_settings",
    });
    const externalMessageId = response.messages?.[0]?.id;

    if (!externalMessageId) {
      throw new ValidationError("WhatsApp API did not return an outbound message id.");
    }

    return {
      externalMessageId,
      providerResponse: response as unknown as Record<string, unknown>,
    };
  }

  private extractMessageContent(message: WhatsAppWebhookMessage): {
    text: string;
    attachments: ChannelAttachmentDto[];
  } {
    switch (message.type) {
      case "text":
        return {
          text: message.text?.body?.trim() ?? "",
          attachments: [],
        };
      case "button":
        return {
          text: message.button?.text ?? message.button?.payload ?? "",
          attachments: [],
        };
      case "interactive": {
        const buttonReply = message.interactive?.button_reply;
        const listReply = message.interactive?.list_reply;
        return {
          text: buttonReply?.title ?? listReply?.title ?? listReply?.id ?? buttonReply?.id ?? "",
          attachments: [],
        };
      }
      case "image":
        return this.mediaMessage(message.type, message.image);
      case "audio":
        return this.mediaMessage(message.type, message.audio);
      case "video":
        return this.mediaMessage(message.type, message.video);
      case "document":
        return this.mediaMessage(message.type, message.document, message.document?.filename);
      case "sticker":
        return this.mediaMessage("image", message.sticker);
      default:
        return {
          text: `[Unsupported WhatsApp message type: ${message.type}]`,
          attachments: [],
        };
    }
  }

  private mediaMessage(
    type: ChannelAttachmentDto["type"],
    media?: { id: string; mime_type?: string; caption?: string; filename?: string },
    filename?: string,
  ): { text: string; attachments: ChannelAttachmentDto[] } {
    if (!media?.id) {
      return { text: "", attachments: [] };
    }

    return {
      text: media.caption?.trim() ?? "",
      attachments: this.attachmentEngine.normalizeAttachments([
        {
          attachmentId: media.id,
          type,
          mimeType: media.mime_type,
          filename: filename ?? media.filename,
          metadata: { whatsappMediaId: media.id },
        },
      ]),
    };
  }

  private formatMediaPayload(
    recipient: string,
    attachment: ChannelAttachmentDto,
    caption: string,
  ): WhatsAppSendMessagePayload {
    const whatsappMediaId =
      typeof attachment.metadata?.whatsappMediaId === "string" ? attachment.metadata.whatsappMediaId : undefined;
    const link = attachment.url;
    const mediaBody = {
      ...(whatsappMediaId ? { id: whatsappMediaId } : {}),
      ...(link ? { link } : {}),
      ...(caption ? { caption } : {}),
      ...(attachment.filename ? { filename: attachment.filename } : {}),
    };

    const type =
      attachment.type === "document"
        ? "document"
        : attachment.type === "audio"
          ? "audio"
          : attachment.type === "video"
            ? "video"
            : "image";

    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipient,
      type,
      [type]: mediaBody,
    } as WhatsAppSendMessagePayload;
  }
}

export function createWhatsAppCloudAdapter(options?: WhatsAppCloudAdapterOptions): WhatsAppCloudAdapter {
  return new WhatsAppCloudAdapter(options);
}
