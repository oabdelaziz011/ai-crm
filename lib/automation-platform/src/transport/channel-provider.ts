import type {
  DeliveryResult,
  InboundMessage,
  MediaType,
  OutboundMessage,
  ProviderCapabilities,
  ProviderContext,
  WebhookVerificationInput,
} from "./models.js";
import type { AutomationChannel } from "../constants.js";
import { ChannelProviderError, WebhookVerificationError } from "../errors.js";

export interface ChannelProvider {
  readonly channel: AutomationChannel;
  readonly providerKey: string;
  getCapabilities(): ProviderCapabilities;
  normalize(payload: unknown, context: ProviderContext): InboundMessage;
  receive(payload: unknown, context: ProviderContext): Promise<InboundMessage>;
  verifySignature(request: WebhookVerificationInput): boolean | Promise<boolean>;
  send(message: OutboundMessage): Promise<DeliveryResult>;
}

export abstract class BaseChannelProvider implements ChannelProvider {
  abstract readonly channel: AutomationChannel;
  abstract readonly providerKey: string;

  abstract getCapabilities(): ProviderCapabilities;

  protected requireObject(payload: unknown): Record<string, unknown> {
    if (!payload || typeof payload !== "object") {
      throw new ChannelProviderError("Provider payload must be an object.");
    }
    return payload as Record<string, unknown>;
  }

  protected readExternalUserId(payload: Record<string, unknown>): string {
    const externalUserId = typeof payload.externalUserId === "string" ? payload.externalUserId.trim() : "";
    if (!externalUserId) throw new ChannelProviderError("Inbound payload requires externalUserId.");
    return externalUserId;
  }

  normalize(payload: unknown, context: ProviderContext): InboundMessage {
    const body = this.requireObject(payload);
    const externalUserId = this.readExternalUserId(body);
    const kind = typeof body.kind === "string" ? body.kind : "text";

    if (kind === "interactive_reply") {
      return {
        kind: "interactive_reply",
        companyId: context.companyId,
        channel: this.channel,
        externalUserId,
        customerId: typeof body.customerId === "string" ? body.customerId : null,
        replyId: String(body.replyId ?? body.buttonId ?? ""),
        title: typeof body.title === "string" ? body.title : undefined,
        payload: typeof body.payload === "object" && body.payload ? (body.payload as Record<string, unknown>) : {},
        receivedAt: new Date().toISOString(),
        externalMessageId: typeof body.externalMessageId === "string" ? body.externalMessageId : null,
        metadata: typeof body.metadata === "object" && body.metadata ? (body.metadata as Record<string, unknown>) : {},
      };
    }

    if (kind === "media") {
      return {
        kind: "media",
        companyId: context.companyId,
        channel: this.channel,
        externalUserId,
        customerId: typeof body.customerId === "string" ? body.customerId : null,
        mediaType: (typeof body.mediaType === "string" ? body.mediaType : "file") as MediaType,
        url: String(body.url ?? ""),
        mimeType: typeof body.mimeType === "string" ? body.mimeType : undefined,
        caption: typeof body.caption === "string" ? body.caption : undefined,
        receivedAt: new Date().toISOString(),
        externalMessageId: typeof body.externalMessageId === "string" ? body.externalMessageId : null,
        metadata: typeof body.metadata === "object" && body.metadata ? (body.metadata as Record<string, unknown>) : {},
      };
    }

    if (kind === "location") {
      return {
        kind: "location",
        companyId: context.companyId,
        channel: this.channel,
        externalUserId,
        customerId: typeof body.customerId === "string" ? body.customerId : null,
        latitude: Number(body.latitude ?? 0),
        longitude: Number(body.longitude ?? 0),
        name: typeof body.name === "string" ? body.name : undefined,
        address: typeof body.address === "string" ? body.address : undefined,
        receivedAt: new Date().toISOString(),
        externalMessageId: typeof body.externalMessageId === "string" ? body.externalMessageId : null,
        metadata: typeof body.metadata === "object" && body.metadata ? (body.metadata as Record<string, unknown>) : {},
      };
    }

    if (kind === "contact") {
      return {
        kind: "contact",
        companyId: context.companyId,
        channel: this.channel,
        externalUserId,
        customerId: typeof body.customerId === "string" ? body.customerId : null,
        name: String(body.name ?? "Unknown"),
        phone: typeof body.phone === "string" ? body.phone : undefined,
        email: typeof body.email === "string" ? body.email : undefined,
        receivedAt: new Date().toISOString(),
        externalMessageId: typeof body.externalMessageId === "string" ? body.externalMessageId : null,
        metadata: typeof body.metadata === "object" && body.metadata ? (body.metadata as Record<string, unknown>) : {},
      };
    }

    return {
      kind: "text",
      companyId: context.companyId,
      channel: this.channel,
      externalUserId,
      customerId: typeof body.customerId === "string" ? body.customerId : null,
      text: typeof body.text === "string" ? body.text : "",
      receivedAt: new Date().toISOString(),
      externalMessageId: typeof body.externalMessageId === "string" ? body.externalMessageId : null,
      metadata: typeof body.metadata === "object" && body.metadata ? (body.metadata as Record<string, unknown>) : {},
    };
  }

  async receive(payload: unknown, context: ProviderContext): Promise<InboundMessage> {
    return this.normalize(payload, context);
  }

  verifySignature(request: WebhookVerificationInput): boolean | Promise<boolean> {
    const provided = request.headers["x-webhook-signature"] ?? request.headers["X-Webhook-Signature"];
    const signature = Array.isArray(provided) ? provided[0] : provided;
    if (!request.secret) return true;
    if (!signature) throw new WebhookVerificationError("Missing webhook signature header.");
    return signature === request.secret;
  }

  async send(message: OutboundMessage): Promise<DeliveryResult> {
    this.assertSupported(message);
    return {
      messageId: message.id ?? `msg-${Date.now()}`,
      status: "sent",
      providerMessageId: `${this.providerKey}-${Date.now()}`,
      metadata: { kind: message.kind },
    };
  }

  protected assertSupported(message: OutboundMessage): void {
    const capabilities = this.getCapabilities();
    if (message.kind === "text" && !capabilities.supportsText) {
      throw new ChannelProviderError(`Provider ${this.providerKey} does not support text messages.`);
    }
    if (message.kind === "buttons" && !capabilities.supportsButtons) {
      throw new ChannelProviderError(`Provider ${this.providerKey} does not support button messages.`);
    }
    if (message.kind === "list" && !capabilities.supportsLists) {
      throw new ChannelProviderError(`Provider ${this.providerKey} does not support list messages.`);
    }
    if (message.kind === "media" && !capabilities.supportsMedia) {
      throw new ChannelProviderError(`Provider ${this.providerKey} does not support media messages.`);
    }
    if (message.kind === "template" && !capabilities.supportsTemplates) {
      throw new ChannelProviderError(`Provider ${this.providerKey} does not support template messages.`);
    }
  }
}
