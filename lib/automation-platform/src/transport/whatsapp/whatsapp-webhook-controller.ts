import type { NormalizedInboundMessage } from "../../types.js";
import type { TransportChannelAdapterBridge } from "../adapter-bridge.js";
import type { DeliveryResult } from "../models.js";
import { parseWhatsAppWebhookEvents, verifyWhatsAppWebhookChallenge } from "./whatsapp-api-client.js";
import type { WhatsAppConfigResolver } from "./whatsapp-config.js";
import type { WhatsAppProvider } from "./whatsapp-provider.js";

export type WhatsAppWebhookControllerOptions = {
  provider: WhatsAppProvider;
  bridge: TransportChannelAdapterBridge;
  configResolver: WhatsAppConfigResolver;
};

export type WhatsAppWebhookHandleResult = {
  verified: boolean;
  inbounds: NormalizedInboundMessage[];
  deliveryUpdates: DeliveryResult[];
};

export class WhatsAppWebhookController {
  constructor(private readonly options: WhatsAppWebhookControllerOptions) {}

  async verifyGet(
    companyId: string,
    query: Record<string, unknown>,
  ): Promise<{ status: number; body: string }> {
    const config = await this.options.configResolver(companyId);
    if (!config) return { status: 404, body: "WhatsApp configuration not found." };

    const challenge = verifyWhatsAppWebhookChallenge({
      mode: typeof query["hub.mode"] === "string" ? query["hub.mode"] : undefined,
      verifyToken: typeof query["hub.verify_token"] === "string" ? query["hub.verify_token"] : undefined,
      challenge: typeof query["hub.challenge"] === "string" ? query["hub.challenge"] : undefined,
      expectedVerifyToken: config.verifyToken,
    });

    if (!challenge) return { status: 403, body: "Forbidden" };
    return { status: 200, body: challenge };
  }

  async handlePost(input: {
    companyId: string;
    headers: Record<string, string | string[] | undefined>;
    rawBody: string;
    payload: Record<string, unknown>;
  }): Promise<WhatsAppWebhookHandleResult> {
    const config = await this.options.configResolver(input.companyId);
    if (!config) {
      return { verified: false, inbounds: [], deliveryUpdates: [] };
    }

    const verified = await this.options.provider.verifySignature({
      headers: input.headers,
      rawBody: input.rawBody,
      secret: config.appSecret ?? null,
    });

    if (!verified) {
      return { verified: false, inbounds: [], deliveryUpdates: [] };
    }

    const events = parseWhatsAppWebhookEvents(input.payload);
    const inbounds: NormalizedInboundMessage[] = [];
    const deliveryUpdates: DeliveryResult[] = [];

    for (const event of events) {
      if (event.kind === "message") {
        const inbound = await this.options.bridge.receive(
          {
            message: event.message,
            senderName: event.senderName,
            phoneNumberId: event.phoneNumberId,
          },
          input.companyId,
          "whatsapp",
        );
        inbounds.push(inbound);
        continue;
      }

      deliveryUpdates.push({
        messageId: event.externalMessageId,
        status: event.status,
        providerMessageId: event.externalMessageId,
        errorMessage: event.errorMessage ?? null,
        metadata: {
          providerKey: this.options.provider.providerKey,
          recipientId: event.externalThreadId,
          providerResponse: event.providerResponse,
        },
      });
    }

    return { verified: true, inbounds, deliveryUpdates };
  }
}

export function createWhatsAppWebhookController(
  options: WhatsAppWebhookControllerOptions,
): WhatsAppWebhookController {
  return new WhatsAppWebhookController(options);
}
