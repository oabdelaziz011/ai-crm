import type { AutomationChannel } from "../../constants.js";
import { ChannelProviderError, ValidationError, WebhookVerificationError } from "../../errors.js";
import { BaseChannelProvider } from "../channel-provider.js";
import type {
  DeliveryResult,
  InboundMessage,
  MediaType,
  OutboundMessage,
  ProviderCapabilities,
  ProviderContext,
  WebhookVerificationInput,
} from "../models.js";
import { WhatsAppApiClient } from "./whatsapp-api-client.js";
import { verifyWhatsAppWebhookSignature } from "./whatsapp-api-client.js";
import type { WhatsAppConfigResolver } from "./whatsapp-config.js";
import type {
  WhatsAppInboundPayload,
  WhatsAppSendMessagePayload,
  WhatsAppWebhookMessage,
} from "./whatsapp-types.js";

export type WhatsAppProviderOptions = {
  configResolver: WhatsAppConfigResolver;
  fetchFn?: typeof fetch;
  apiClient?: WhatsAppApiClient;
};

export class WhatsAppProvider extends BaseChannelProvider {
  readonly channel: AutomationChannel = "whatsapp";
  readonly providerKey = "meta.whatsapp.cloud";

  private readonly configResolver: WhatsAppConfigResolver;
  private readonly apiClient: WhatsAppApiClient;

  constructor(options: WhatsAppProviderOptions) {
    super();
    this.configResolver = options.configResolver;
    this.apiClient = options.apiClient ?? new WhatsAppApiClient({ fetchFn: options.fetchFn });
  }

  getCapabilities(): ProviderCapabilities {
    return {
      channel: this.channel,
      providerKey: this.providerKey,
      supportsText: true,
      supportsButtons: true,
      supportsLists: true,
      supportsMedia: true,
      supportsTemplates: true,
      supportsInteractiveReplies: true,
      supportsDeliveryReceipts: true,
      supportsReadReceipts: true,
    };
  }

  normalize(payload: unknown, context: ProviderContext): InboundMessage {
    const body = this.requireObject(payload);
    if (body.message && typeof body.message === "object") {
      return this.normalizeWhatsAppMessage(body as WhatsAppInboundPayload, context);
    }
    return super.normalize(payload, context);
  }

  async verifySignature(request: WebhookVerificationInput): Promise<boolean> {
    const signatureHeader =
      request.headers["x-hub-signature-256"] ??
      request.headers["X-Hub-Signature-256"] ??
      request.headers["x-webhook-signature"] ??
      request.headers["X-Webhook-Signature"];
    const header = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

    const verified = await verifyWhatsAppWebhookSignature({
      signatureHeader: header,
      rawBody: request.rawBody,
      appSecret: request.secret,
      requireSecret: Boolean(request.secret),
    });

    if (!verified && request.secret) {
      throw new WebhookVerificationError("Invalid WhatsApp webhook signature.");
    }

    return verified;
  }

  async send(message: OutboundMessage): Promise<DeliveryResult> {
    this.assertSupported(message);
    const config = await this.requireConfig(message.companyId);
    const payload = this.formatOutboundMessage(message);
    const messageId = message.id ?? `msg-${Date.now()}`;

    const response = await this.apiClient.sendMessage(config, payload);
    const providerMessageId = response.messages?.[0]?.id;
    if (!providerMessageId) {
      throw new ChannelProviderError("WhatsApp API did not return an outbound message id.");
    }

    return {
      messageId,
      status: "sent",
      providerMessageId,
      metadata: {
        providerKey: this.providerKey,
        phoneNumberId: config.phoneNumberId,
        businessAccountId: config.businessAccountId ?? null,
        kind: message.kind,
      },
    };
  }

  formatOutboundMessage(message: OutboundMessage): WhatsAppSendMessagePayload {
    const to = message.externalUserId;

    if (message.kind === "text") {
      return {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body: message.text },
      };
    }

    if (message.kind === "buttons") {
      return {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: message.text },
          action: {
            buttons: message.buttons.slice(0, 3).map((button) => ({
              type: "reply",
              reply: { id: button.id, title: button.label.slice(0, 20) },
            })),
          },
        },
      };
    }

    if (message.kind === "list") {
      return {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "interactive",
        interactive: {
          type: "list",
          header: message.title ? { type: "text", text: message.title } : undefined,
          body: { text: message.body },
          action: {
            button: message.buttonLabel.slice(0, 20),
            sections: message.sections.map((section) => ({
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
    }

    if (message.kind === "template") {
      const components = Array.isArray(message.variables.components)
        ? (message.variables.components as Array<Record<string, unknown>>)
        : undefined;
      return {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "template",
        template: {
          name: message.templateKey,
          language: { code: message.language ?? "en_US" },
          components,
        },
      };
    }

    const mediaType =
      message.mediaType === "document"
        ? "document"
        : message.mediaType === "audio"
          ? "audio"
          : message.mediaType === "video"
            ? "video"
            : "image";
    const mediaBody = {
      link: message.url,
      ...(message.caption ? { caption: message.caption } : {}),
      ...(message.mimeType && mediaType === "document" ? { filename: message.metadata?.filename as string | undefined } : {}),
    };

    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: mediaType,
      [mediaType]: mediaBody,
    } as WhatsAppSendMessagePayload;
  }

  private normalizeWhatsAppMessage(payload: WhatsAppInboundPayload, context: ProviderContext): InboundMessage {
    const message = payload.message;
    const base = {
      companyId: context.companyId,
      channel: this.channel,
      externalUserId: message.from,
      customerId: null,
      receivedAt: new Date(Number(message.timestamp) * 1000 || Date.now()).toISOString(),
      externalMessageId: message.id,
      metadata: {
        whatsappMessageType: message.type,
        senderName: payload.senderName,
        phoneNumberId: payload.phoneNumberId,
      },
    };

    switch (message.type) {
      case "text":
        return { ...base, kind: "text", text: message.text?.body?.trim() ?? "" };
      case "button":
        return {
          ...base,
          kind: "interactive_reply",
          replyId: message.button?.payload ?? "",
          title: message.button?.text,
          payload: { source: "button", payload: message.button?.payload },
        };
      case "interactive":
        return this.normalizeInteractiveReply(base, message);
      case "image":
        return this.normalizeMedia(base, "image", message.image);
      case "audio":
        return this.normalizeMedia(base, "audio", message.audio);
      case "video":
        return this.normalizeMedia(base, "video", message.video);
      case "document":
        return this.normalizeMedia(base, "document", message.document, message.document?.filename);
      case "location":
        return {
          ...base,
          kind: "location",
          latitude: message.location?.latitude ?? 0,
          longitude: message.location?.longitude ?? 0,
          name: message.location?.name,
          address: message.location?.address,
        };
      case "contacts": {
        const contact = message.contacts?.[0];
        const name =
          contact?.name?.formatted_name ??
          [contact?.name?.first_name, contact?.name?.last_name].filter(Boolean).join(" ") ??
          "Unknown";
        return {
          ...base,
          kind: "contact",
          name,
          phone: contact?.phones?.[0]?.phone,
          email: contact?.emails?.[0]?.email,
        };
      }
      default:
        return {
          ...base,
          kind: "text",
          text: `[Unsupported WhatsApp message type: ${message.type}]`,
        };
    }
  }

  private normalizeInteractiveReply(
    base: Omit<InboundMessage, "kind"> & Record<string, unknown>,
    message: WhatsAppWebhookMessage,
  ): InboundMessage {
    const buttonReply = message.interactive?.button_reply;
    if (buttonReply) {
      return {
        ...(base as InboundMessage),
        kind: "interactive_reply",
        replyId: buttonReply.id,
        title: buttonReply.title,
        payload: { source: "button_reply" },
      };
    }

    const listReply = message.interactive?.list_reply;
    if (listReply) {
      return {
        ...(base as InboundMessage),
        kind: "interactive_reply",
        replyId: listReply.id,
        title: listReply.title,
        payload: { source: "list_reply", description: listReply.description },
      };
    }

    return {
      ...(base as InboundMessage),
      kind: "text",
      text: "",
    };
  }

  private normalizeMedia(
    base: Omit<InboundMessage, "kind"> & Record<string, unknown>,
    mediaType: MediaType,
    media?: { id: string; mime_type?: string; caption?: string },
    filename?: string,
  ): InboundMessage {
    return {
      ...(base as InboundMessage),
      kind: "media",
      mediaType,
      url: media?.id ?? "",
      mimeType: media?.mime_type,
      caption: media?.caption,
      metadata: {
        ...(base.metadata as Record<string, unknown>),
        whatsappMediaId: media?.id,
        filename,
      },
    };
  }

  private async requireConfig(companyId: string) {
    const config = await this.configResolver(companyId);
    if (!config) {
      throw new ValidationError(`WhatsApp configuration not found for company ${companyId}.`);
    }
    return config;
  }
}

export function createWhatsAppProvider(options: WhatsAppProviderOptions): WhatsAppProvider {
  return new WhatsAppProvider(options);
}
