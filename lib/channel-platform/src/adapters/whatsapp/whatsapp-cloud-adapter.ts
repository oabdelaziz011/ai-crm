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
import { parseWhatsAppConfiguration } from "./whatsapp-config.js";
import type { WhatsAppSendMessagePayload, WhatsAppWebhookMessage } from "./whatsapp-types.js";

export type WhatsAppCloudAdapterOptions = {
  fetchFn?: typeof fetch;
};

export class WhatsAppCloudAdapter implements ChannelAdapterPort {
  readonly channelKey = "whatsapp";

  private readonly apiClient: WhatsAppApiClient;
  private readonly attachmentEngine = new AttachmentEngine();

  constructor(options: WhatsAppCloudAdapterOptions = {}) {
    this.apiClient = new WhatsAppApiClient({ fetchFn: options.fetchFn });
  }

  parseWebhook(ctx: ChannelAdapterContext, rawPayload: Record<string, unknown>): WebhookEnvelopeDto {
    const events = parseWhatsAppWebhookEvents(rawPayload);
    const primary = events[0];

    if (!primary) {
      throw new ValidationError("WhatsApp webhook payload did not contain routable events.");
    }

    if (primary.kind === "status") {
      return {
        eventType: primary.status === "read" ? "message.read" : "message.status",
        companyChannelId: ctx.companyChannel.id,
        channelKey: this.channelKey,
        idempotencyKey: primary.idempotencyKey,
        externalThreadId: primary.externalThreadId,
        externalMessageId: primary.externalMessageId,
        payload: {
          deliveryStatus: primary.status,
          providerResponse: primary.providerResponse,
          errorMessage: primary.errorMessage,
          raw: primary.raw,
        },
      };
    }

    return {
      eventType: "message.received",
      companyChannelId: ctx.companyChannel.id,
      channelKey: this.channelKey,
      idempotencyKey: primary.idempotencyKey,
      externalThreadId: primary.externalThreadId,
      externalMessageId: primary.externalMessageId,
      payload: {
        message: primary.message,
        senderExternalId: primary.senderExternalId,
        senderName: primary.senderName,
        phoneNumberId: primary.phoneNumberId,
        raw: primary.raw,
      },
    };
  }

  normalizeInbound(_ctx: ChannelAdapterContext, payload: Record<string, unknown>): NormalizedInboundMessageDto {
    const message = payload.message as WhatsAppWebhookMessage | undefined;
    if (!message) {
      throw new ValidationError("WhatsApp inbound payload missing message object.");
    }

    const { text, attachments } = this.extractMessageContent(message);

    return {
      externalThreadId: message.from,
      externalMessageId: message.id,
      senderExternalId: message.from,
      text,
      attachments,
      metadata: {
        whatsappMessageType: message.type,
        senderName: typeof payload.senderName === "string" ? payload.senderName : undefined,
        phoneNumberId: typeof payload.phoneNumberId === "string" ? payload.phoneNumberId : undefined,
      },
    };
  }

  formatOutbound(_ctx: ChannelAdapterContext, message: OutboundChannelMessageDto): Record<string, unknown> {
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
    const config = parseWhatsAppConfiguration(ctx.companyChannel.configuration);
    const payload = formattedPayload.payload as WhatsAppSendMessagePayload;
    const response = await this.apiClient.sendMessage(config, payload);
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
      case "interactive":
        return {
          text: message.interactive?.button_reply?.title ?? "",
          attachments: [],
        };
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
