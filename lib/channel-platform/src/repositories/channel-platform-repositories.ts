import type {
  ChannelDeliveryEventRecord,
  ChannelInboundEventRecord,
  ChannelSessionRecord,
  DeliveryStatus,
  InboundProcessingStatus,
} from "../types.js";

export type CreateInboundEventInput = {
  companyId: string;
  companyChannelId: string;
  channelKey: string;
  idempotencyKey: string;
  externalThreadId: string;
  externalMessageId?: string | null;
  senderExternalId?: string | null;
  payload: Record<string, unknown>;
};

export type UpdateInboundEventInput = {
  inboundEventId: string;
  processingStatus: InboundProcessingStatus;
  conversationId?: string | null;
  channelSessionId?: string | null;
  incomingMessageId?: string | null;
  runtimeExecutionId?: string | null;
  errorMessage?: string | null;
  processedAt?: string | null;
};

export type CreateDeliveryEventInput = {
  companyId: string;
  companyChannelId: string;
  channelKey: string;
  conversationId: string;
  channelSessionId?: string | null;
  outboundMessageId?: string | null;
  externalThreadId: string;
  payload: Record<string, unknown>;
};

export type UpdateDeliveryEventInput = {
  deliveryEventId: string;
  deliveryStatus: DeliveryStatus;
  externalMessageId?: string | null;
  providerResponse?: Record<string, unknown>;
  errorMessage?: string | null;
  attemptCount?: number;
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  failedAt?: string | null;
};

export type ResolveSessionInput = {
  companyId: string;
  companyChannelId: string;
  channelKey: string;
  externalThreadId: string;
  senderExternalId?: string | null;
  conversationId?: string;
  aiAssistantId?: string;
  metadata?: Record<string, unknown>;
};

export type ChannelSessionRepository = {
  findByExternalThread(companyChannelId: string, externalThreadId: string): Promise<ChannelSessionRecord | null>;
  createSession(input: ResolveSessionInput & { conversationId: string }): Promise<ChannelSessionRecord>;
  touchInbound(sessionId: string): Promise<ChannelSessionRecord>;
  touchOutbound(sessionId: string): Promise<ChannelSessionRecord>;
};

export type ChannelInboundEventRepository = {
  findByIdempotencyKey(companyChannelId: string, idempotencyKey: string): Promise<ChannelInboundEventRecord | null>;
  createEvent(input: CreateInboundEventInput): Promise<ChannelInboundEventRecord>;
  updateEvent(input: UpdateInboundEventInput): Promise<ChannelInboundEventRecord>;
};

export type ChannelDeliveryEventRepository = {
  createEvent(input: CreateDeliveryEventInput): Promise<ChannelDeliveryEventRecord>;
  updateEvent(input: UpdateDeliveryEventInput): Promise<ChannelDeliveryEventRecord>;
  findById(deliveryEventId: string): Promise<ChannelDeliveryEventRecord | null>;
  findByExternalMessageId(
    companyChannelId: string,
    externalMessageId: string,
  ): Promise<ChannelDeliveryEventRecord | null>;
};
