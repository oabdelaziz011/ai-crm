import type { ServiceContext } from "../types.js";
import type { ChannelProvider } from "./channel-provider.js";
import { extractInboundText, type DeliveryResult, type InboundMessage, type WebhookProcessResult, type WebhookRequest } from "./models.js";
import type { ChannelProviderRegistry } from "./provider-registry.js";

export interface WebhookHandler {
  handle(request: WebhookRequest, context: WebhookHandlerContext): Promise<WebhookProcessResult>;
}

export type WebhookHandlerContext = {
  companyId: string;
  webhookSecret?: string | null;
  serviceContext?: ServiceContext;
};

export class ChannelWebhookHandler implements WebhookHandler {
  constructor(private readonly registry: ChannelProviderRegistry) {}

  async handle(request: WebhookRequest, context: WebhookHandlerContext): Promise<WebhookProcessResult> {
    const provider = this.registry.get(request.channel);
    const verified = await provider.verifySignature({
      headers: request.headers,
      rawBody: request.rawBody,
      secret: context.webhookSecret ?? null,
    });

    if (!verified) {
      return { verified: false, inbound: null, deliveryUpdates: [] };
    }

    const inbound = await provider.receive(request.payload, {
      companyId: context.companyId,
      webhookSecret: context.webhookSecret ?? null,
    });

    const deliveryUpdates = this.extractDeliveryUpdates(request.payload, provider);
    return { verified: true, inbound, deliveryUpdates };
  }

  private extractDeliveryUpdates(payload: unknown, provider: ChannelProvider): DeliveryResult[] {
    if (!payload || typeof payload !== "object") return [];
    const body = payload as Record<string, unknown>;
    const updates = Array.isArray(body.deliveryUpdates) ? body.deliveryUpdates : [];
    return updates
      .filter((entry) => entry && typeof entry === "object")
      .map((entry, index) => {
        const update = entry as Record<string, unknown>;
        return {
          messageId: String(update.messageId ?? `delivery-${index + 1}`),
          status: (update.status as DeliveryResult["status"]) ?? "delivered",
          providerMessageId: typeof update.providerMessageId === "string" ? update.providerMessageId : null,
          errorMessage: typeof update.errorMessage === "string" ? update.errorMessage : null,
          metadata: {
            providerKey: provider.providerKey,
            ...(typeof update.metadata === "object" && update.metadata ? (update.metadata as Record<string, unknown>) : {}),
          },
        };
      });
  }
}

export function inboundToOrchestratorPayload(message: InboundMessage): Record<string, unknown> {
  return {
    kind: message.kind,
    externalUserId: message.externalUserId,
    customerId: message.customerId,
    text: extractInboundText(message),
    externalMessageId: message.externalMessageId,
    metadata: message.metadata,
    ...(message.kind === "interactive_reply"
      ? { replyId: message.replyId, title: message.title, payload: message.payload }
      : {}),
    ...(message.kind === "media"
      ? { mediaType: message.mediaType, url: message.url, mimeType: message.mimeType, caption: message.caption }
      : {}),
    ...(message.kind === "location"
      ? {
          latitude: message.latitude,
          longitude: message.longitude,
          name: message.name,
          address: message.address,
        }
      : {}),
    ...(message.kind === "contact" ? { name: message.name, phone: message.phone, email: message.email } : {}),
  };
}
