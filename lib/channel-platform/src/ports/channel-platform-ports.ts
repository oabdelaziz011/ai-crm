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
  findCompanyChannelByPhoneNumberId(phoneNumberId: string): Promise<ResolvedCompanyChannel[]>;
  findCompanyChannelByInstagramBusinessAccountId(
    instagramBusinessAccountId: string,
  ): Promise<ResolvedCompanyChannel[]>;
  findCompanyChannelsByWhatsAppVerifyToken(verifyToken: string): Promise<ResolvedCompanyChannel[]>;
  findCompanyChannelsByInstagramVerifyToken(verifyToken: string): Promise<ResolvedCompanyChannel[]>;
  findCompanyChannelByMessengerPageId(pageId: string): Promise<ResolvedCompanyChannel[]>;
  findCompanyChannelsByMessengerVerifyToken(verifyToken: string): Promise<ResolvedCompanyChannel[]>;
  findCompanyChannelByFromEmail(fromEmail: string): Promise<ResolvedCompanyChannel[]>;
  listEnabledWhatsAppChannels(): Promise<ResolvedCompanyChannel[]>;
  listEnabledInstagramChannels(): Promise<ResolvedCompanyChannel[]>;
  listEnabledMessengerChannels(): Promise<ResolvedCompanyChannel[]>;
  listEnabledEmailChannels(): Promise<ResolvedCompanyChannel[]>;
  syncWhatsAppPhoneNumberId(companyChannelId: string, phoneNumberId: string): Promise<void>;
  syncInstagramBusinessAccountId(
    companyChannelId: string,
    instagramBusinessAccountId: string,
  ): Promise<void>;
  syncMessengerPageId(companyChannelId: string, pageId: string): Promise<void>;
  syncEmailFromEmail(companyChannelId: string, fromEmail: string): Promise<void>;
};

export type ChannelConversationPort = {
  /** Resolves the company's assistant record for workflow sessions (no provider required). */
  resolveCompanyAssistantId?(companyId: string): Promise<string | null>;

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

export type ChannelAutomationPort = {
  startWorkflow(input: {
    companyId: string;
    flowId: string;
    channelKey: string;
    externalUserId: string;
    messageText: string;
    externalMessageId?: string;
    initialVariables?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<{
    runId: string;
    responseContent?: string;
    outboundMessages?: Array<{
      text: string;
      payload?: Record<string, unknown>;
      attachments?: import("../dto/channel-dto.js").ChannelAttachmentDto[];
    }>;
    lifecycle?: string;
    flowVersionId?: string;
    resumed?: boolean;
  }>;
};

export type ChannelPlatformPorts = {
  registry: ChannelRegistryPort;
  conversation: ChannelConversationPort;
  runtime: ChannelRuntimePort;
  automation?: ChannelAutomationPort;
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
