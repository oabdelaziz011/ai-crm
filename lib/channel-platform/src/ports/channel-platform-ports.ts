import type {
  ChannelRuntimeConfigDto,
  InboundRouteRequestDto,
  InboundRouteResponseDto,
  OutboundDispatchRequestDto,
  OutboundDispatchResponseDto,
} from "../dto/channel-dto.js";
import type {
  ConversationMessageSummary,
  ResolvedCompanyChannel,
  RuntimeExecutionSummary,
  ServiceContext,
} from "../types.js";

export type ChannelRegistryPort = {
  getCompanyChannel(companyChannelId: string): Promise<ResolvedCompanyChannel | null>;
};

export type ChannelConversationPort = {
  createConversation(input: {
    companyId: string;
    aiAssistantId: string;
    companyChannelId: string;
    channelType: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string }>;

  addIncomingMessage(input: {
    conversationId: string;
    content: string;
    externalMessageId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<ConversationMessageSummary>;

  addOutgoingMessage(input: {
    conversationId: string;
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<ConversationMessageSummary>;
};

export type ChannelRuntimePort = {
  execute(input: {
    companyId: string;
    conversationId: string;
    messageText: string;
    runtimeConfig: ChannelRuntimeConfigDto;
    correlationId?: string;
    onStreamChunk?: (chunk: string) => void;
    abortSignal?: AbortSignal;
  }): Promise<RuntimeExecutionSummary>;
};

export type ChannelPlatformPorts = {
  registry: ChannelRegistryPort;
  conversation: ChannelConversationPort;
  runtime: ChannelRuntimePort;
};

export type ChannelRouterPort = {
  routeInbound(ctx: ServiceContext, request: InboundRouteRequestDto): Promise<InboundRouteResponseDto>;
  routeWebhook(
    ctx: ServiceContext,
    request: {
      companyId: string;
      companyChannelId: string;
      channelKey: string;
      rawPayload: Record<string, unknown>;
      executeAi?: boolean;
      runtimeConfig?: ChannelRuntimeConfigDto;
      aiAssistantId?: string;
    },
  ): Promise<InboundRouteResponseDto>;
};

export type ChannelDispatcherPort = {
  dispatch(ctx: ServiceContext, request: OutboundDispatchRequestDto): Promise<OutboundDispatchResponseDto>;
};
