import type { AttachmentType, InboundSource, WebhookEventType } from "../constants.js";

export type ChannelAttachmentDto = {
  attachmentId: string;
  type: AttachmentType;
  url?: string;
  mimeType?: string;
  filename?: string;
  caption?: string;
  metadata?: Record<string, unknown>;
};

export type NormalizedInboundMessageDto = {
  externalThreadId: string;
  externalMessageId: string;
  senderExternalId: string | null;
  text: string;
  attachments: ChannelAttachmentDto[];
  metadata?: Record<string, unknown>;
};

export type OutboundChannelMessageDto = {
  conversationId: string;
  companyChannelId: string;
  channelKey: string;
  externalThreadId: string;
  text: string;
  attachments?: ChannelAttachmentDto[];
  metadata?: Record<string, unknown>;
};

export type ChannelRuntimeConfigDto = {
  providerConnectionId: string;
  knowledgeRetrieval?: {
    embeddingConnectionId: string;
    vectorStoreConnectionId: string;
    collectionId: string;
    topK?: number;
    minScore?: number;
  };
  executionPolicy?: {
    streaming?: boolean;
    maxDurationMs?: number;
  };
};

export type InboundRouteRequestDto = {
  companyId: string;
  companyChannelId: string;
  channelKey: string;
  source: InboundSource;
  idempotencyKey?: string;
  externalThreadId: string;
  externalMessageId?: string;
  senderExternalId?: string | null;
  payload: Record<string, unknown>;
  /** When set, pipeline triggers runtime after persisting the inbound message */
  executeAi?: boolean;
  runtimeConfig?: ChannelRuntimeConfigDto;
  /** Existing conversation to bind (direct/web chat flows) */
  conversationId?: string;
  aiAssistantId?: string;
  onStreamChunk?: (chunk: string) => void;
  abortSignal?: AbortSignal;
};

export type InboundRouteResponseDto = {
  inboundEventId: string;
  conversationId: string;
  channelSessionId: string;
  incomingMessageId: string;
  runtimeExecutionId?: string;
  outboundDeliveryId?: string;
  responseContent?: string;
  duplicate?: boolean;
};

export type OutboundDispatchRequestDto = {
  companyId: string;
  companyChannelId: string;
  channelKey: string;
  conversationId: string;
  channelSessionId: string;
  externalThreadId: string;
  text: string;
  attachments?: ChannelAttachmentDto[];
  outboundMessageId?: string;
  metadata?: Record<string, unknown>;
  /** When false, conversation outgoing message is not created (runtime already persisted it). */
  persistConversationMessage?: boolean;
};

export type OutboundDispatchResponseDto = {
  deliveryEventId: string;
  deliveryStatus: string;
  externalMessageId?: string;
};

export type WebhookEnvelopeDto = {
  eventType: WebhookEventType;
  companyChannelId: string;
  channelKey: string;
  idempotencyKey: string;
  externalThreadId: string;
  externalMessageId?: string;
  payload: Record<string, unknown>;
  receivedAt?: string;
};

export type DeliveryStatusUpdateDto = {
  deliveryEventId: string;
  status: "sent" | "delivered" | "read" | "failed";
  externalMessageId?: string;
  providerResponse?: Record<string, unknown>;
  errorMessage?: string;
};
