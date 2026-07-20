import type { AutomationChannel } from "../constants.js";
import type { NormalizedInboundMessage, NormalizedOutboundMessage } from "../types.js";
import type { ChannelProvider } from "./channel-provider.js";
import { extractInboundText, type InboundMessage, type OutboundMessage } from "./models.js";
import type { ChannelProviderRegistry } from "./provider-registry.js";
import { ChannelTransportService } from "./transport-service.js";
import { ExponentialBackoffRetryPolicy, type RetryPolicy } from "./retry-policy.js";

export class TransportChannelAdapterBridge {
  constructor(
    private readonly registry: ChannelProviderRegistry,
    private readonly transport: ChannelTransportService,
  ) {}

  getProvider(channel: AutomationChannel): ChannelProvider {
    return this.registry.get(channel);
  }

  normalize(raw: unknown, companyId: string, channel: AutomationChannel): NormalizedInboundMessage {
    const inbound = this.registry.get(channel).normalize(raw, { companyId });
    return this.toNormalizedInbound(inbound);
  }

  async receive(raw: unknown, companyId: string, channel: AutomationChannel): Promise<NormalizedInboundMessage> {
    const inbound = await this.registry.get(channel).receive(raw, { companyId });
    return this.toNormalizedInbound(inbound);
  }

  async send(message: NormalizedOutboundMessage, policy?: RetryPolicy): Promise<void> {
    await this.transport.send(this.toOutboundMessage(message), policy);
  }

  toNormalizedInbound(message: InboundMessage): NormalizedInboundMessage {
    return {
      channel: message.channel,
      companyId: message.companyId,
      externalUserId: message.externalUserId,
      customerId: message.customerId ?? null,
      messageType: message.kind === "text" ? "text" : "payload",
      text: extractInboundText(message),
      payload: {
        kind: message.kind,
        ...(message.metadata ?? {}),
        ...(message.kind === "interactive_reply"
          ? { replyId: message.replyId, title: message.title, interactivePayload: message.payload }
          : {}),
      },
      receivedAt: message.receivedAt,
      externalMessageId: message.externalMessageId ?? null,
    };
  }

  toOutboundMessage(message: NormalizedOutboundMessage): OutboundMessage {
    return {
      kind: "text",
      companyId: message.companyId,
      channel: message.channel,
      externalUserId: message.externalUserId,
      sessionId: message.sessionId,
      text: message.text,
      metadata: message.payload,
    };
  }
}

export function createTransportChannelAdapterBridge(
  registry: ChannelProviderRegistry,
  retryPolicy: RetryPolicy = new ExponentialBackoffRetryPolicy(),
): TransportChannelAdapterBridge {
  const transport = new ChannelTransportService(registry, retryPolicy);
  return new TransportChannelAdapterBridge(registry, transport);
}
