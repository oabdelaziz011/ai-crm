import type {
  InboundRouteRequestDto,
  InboundRouteResponseDto,
  NormalizedInboundMessageDto,
  OutboundChannelMessageDto,
  OutboundDispatchRequestDto,
  OutboundDispatchResponseDto,
  WebhookEnvelopeDto,
} from "../dto/channel-dto.js";
import type { ResolvedCompanyChannel, ServiceContext } from "../types.js";

export type ChannelAdapterContext = {
  companyChannel: ResolvedCompanyChannel;
};

export type ChannelAdapterSendResult = {
  externalMessageId: string;
  providerResponse?: Record<string, unknown>;
};

/** Provider-independent adapter contract — one implementation per channel key. */
export type ChannelAdapterPort = {
  readonly channelKey: string;

  /** Parse provider-specific webhook payloads into a normalized envelope. */
  parseWebhook?(ctx: ChannelAdapterContext, rawPayload: Record<string, unknown>): WebhookEnvelopeDto;

  /** Normalize inbound payload into a canonical message shape. */
  normalizeInbound(
    ctx: ChannelAdapterContext,
    payload: Record<string, unknown>,
  ): NormalizedInboundMessageDto;

  /** Format an outbound message for the provider transport layer. */
  formatOutbound(
    ctx: ChannelAdapterContext,
    message: OutboundChannelMessageDto,
  ): Record<string, unknown>;

  /** Deliver formatted payload to the external channel. */
  sendOutbound(
    ctx: ChannelAdapterContext,
    formattedPayload: Record<string, unknown>,
  ): Promise<ChannelAdapterSendResult>;
};

export type ChannelAdapterRegistryPort = {
  register(adapter: ChannelAdapterPort): void;
  get(channelKey: string): ChannelAdapterPort | null;
  require(channelKey: string): ChannelAdapterPort;
};
