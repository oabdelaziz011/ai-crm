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

export type ChannelEmployeeRuntimePort = {
  resolveForInboundChannel(input: {
    companyId: string;
    companyChannelId: string;
    channelKey: string;
  }): Promise<{
    aiEmployeeId: string;
    conversationMetadataSeed: Record<string, unknown>;
    sessionTimeoutMinutes: number;
  } | null>;

  /** Resolve session timeout when inbound already has a pre-selected employee id. */
  resolveSessionTimeoutMinutes?(input: {
    companyId: string;
    aiEmployeeId: string;
  }): Promise<number | null>;

  prepareForConversation(input: {
    companyId: string;
    conversationId: string;
    aiEmployeeId: string;
    conversationMetadata?: Record<string, unknown> | null;
    basePageContext?: Record<string, unknown>;
    /** WhatsApp deterministic welcome already sent or suppressed — omit LLM welcome prompt. */
    suppressWelcomePrompt?: boolean;
  }): Promise<{
    runtimeConfig: ChannelRuntimeConfigDto;
    metadataPatch: Record<string, unknown> | null;
  } | null>;

  /** WhatsApp-only: resolve configured welcome text for deterministic first-turn outbound. */
  resolveWhatsAppDeterministicWelcome?(input: {
    companyId: string;
    aiEmployeeId: string;
    trustedCustomerName?: string | null;
  }): Promise<{ welcomeText: string } | null>;
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

  /** Resolve an already-persisted incoming row for a retried inbound webhook event. */
  findIncomingMessageForInboundEvent?(input: {
    conversationId: string;
    inboundEventId: string;
    externalMessageId?: string;
  }): Promise<ConversationMessageSummary | null>;

  addOutgoingMessage(input: {
    conversationId: string;
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<ConversationMessageSummary>;

  /**
   * After provider send succeeds for a pre-persisted outgoing row, confirm
   * delivery fields (status / external id / outboundPhase). Optional so test
   * doubles without DB can omit it.
   */
  confirmOutgoingDelivery?(input: {
    messageId: string;
    status: string;
    externalMessageId?: string | null;
  }): Promise<void>;

  updateConversationMetadata?(input: {
    conversationId: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;

  getConversationMetadata?(conversationId: string): Promise<Record<string, unknown> | null>;

  /** True when the conversation already has at least one persisted outgoing message. */
  hasOutgoingMessages?(conversationId: string): Promise<boolean>;

  /** Phase 2 — read trusted CRM link (null-safe). */
  getConversationCustomerId?(conversationId: string): Promise<string | null>;

  /**
   * Phase 2 — bind trusted CRM customer when conversation.customer_id IS NULL.
   * Must not overwrite an existing trusted identity.
   */
  linkConversationCustomerIfEmpty?(input: {
    conversationId: string;
    customerId: string;
    companyId: string;
  }): Promise<void>;
};

/**
 * Phase 2 — resolve trusted CRM identity from inbound channel sender (WhatsApp phone).
 * companyId must come from trusted channel routing, never from payload/LLM.
 */
export type ChannelCustomerIdentityPort = {
  resolveTrustedCustomer(input: {
    companyId: string;
    channelKey: string;
    senderExternalId: string | null | undefined;
  }): Promise<{
    status: "known" | "unknown" | "ambiguous" | "unsupported_channel" | "invalid_sender";
    customerId: string | null;
    trustedCustomerName: string | null;
  }>;

  /**
   * Load a company-scoped CRM customer by id (name hydration / consistency checks).
   * Optional — fail closed (no hydration) when absent.
   */
  getCustomerById?(input: {
    companyId: string;
    customerId: string;
  }): Promise<{
    id: string;
    name: string | null;
    phone: string | null;
    /** Phase D2 — optional canonical E.164 when available. */
    phoneE164?: string | null;
  } | null>;

  /**
   * True when the CRM customer's phone is consistent with the WhatsApp sender id.
   * Optional — fail closed (treat as inconsistent) when absent.
   */
  customerMatchesWhatsAppSender?(input: {
    companyId: string;
    customerId: string;
    senderExternalId: string | null | undefined;
  }): Promise<{ matches: boolean; name: string | null }>;
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
  /**
   * True when there is a waiting_input run/session that can be resumed for this user+flow.
   * Used to drop stale AI→workflow sticky transfers after the flow already completed.
   */
  hasWaitingRun?(input: {
    companyId: string;
    flowId: string;
    channelKey: string;
    externalUserId: string;
  }): Promise<boolean>;
};

/**
 * Human Handoff inbound gate — when wired, inbound AI/workflow automated replies
 * must respect ownership / pause / assignee. Absent → legacy allow (tests only).
 */
export type ChannelInboundAutomationGateDecision = {
  allowAutomatedReply: boolean;
  reason: string;
  source: string;
};

export type ChannelInboundAutomationGatePort = {
  evaluate(input: {
    companyId: string;
    conversationId: string;
  }): Promise<ChannelInboundAutomationGateDecision>;
};

export type ChannelPlatformPorts = {
  registry: ChannelRegistryPort;
  conversation: ChannelConversationPort;
  runtime: ChannelRuntimePort;
  employeeRuntime?: ChannelEmployeeRuntimePort;
  automation?: ChannelAutomationPort;
  /** Phase 2 — WhatsApp trusted CRM identity (optional; fail closed when absent). */
  customerIdentity?: ChannelCustomerIdentityPort;
  /**
   * Human Handoff: skip AI Employee + sticky automation when conversation is
   * human-owned, queued, paused, or transferred.
   */
  inboundAutomationGate?: ChannelInboundAutomationGatePort;
  /** Sprint 5: AI Email Routing → existing ticket create/assign. */
  emailRoutingTickets?: import("./email-routing-ticket-action-port.js").EmailRoutingTicketActionPort;
  /** Sprint 6: ai_email_routing entitlement + usage metering. */
  aiEmailRoutingCommercial?: import("./ai-email-routing-commercial-port.js").AiEmailRoutingCommercialPort;
  /** Sprint 3: ai_employee entitlement + usage for Email-channel AI Employee replies. */
  aiEmployeeEmailCommercial?: import("./ai-employee-email-commercial-port.js").AiEmployeeEmailCommercialPort;
  /** Sprint 6G: whatsapp_channel entitlement + usage for WhatsApp outbound sends. */
  whatsappMessagesCommercial?: import("./whatsapp-messages-commercial-port.js").WhatsAppMessagesCommercialPort;
  /** B1.1: per-channel commercial entitlement for inbound/outbound sellable channels. */
  channelCommercialEntitlement?: import("./channel-commercial-entitlement-port.js").ChannelCommercialEntitlementPort;
  /**
   * H3: resolve internal conversation-attachments to ephemeral signed URLs
   * immediately before provider formatting. Optional — when absent, attachments pass through.
   */
  conversationAttachmentUrl?: import("../services/conversation-attachment-url.js").ConversationAttachmentUrlPort;
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
      aiEmployeeId?: string;
      employeeConversationMetadata?: Record<string, unknown>;
    },
  ): Promise<InboundRouteResponseDto>;
};

export type ChannelDispatcherPort = {
  dispatch(ctx: ServiceContext, request: OutboundDispatchRequestDto): Promise<OutboundDispatchResponseDto>;
};
