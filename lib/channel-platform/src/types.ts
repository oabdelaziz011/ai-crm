import type { DeliveryStatus, InboundProcessingStatus, ChannelSessionStatus } from "./constants.js";

export type { DeliveryStatus, InboundProcessingStatus, ChannelSessionStatus };

export type ServiceContext = {
  userId: string | null;
  companyId: string | null;
  isSuperAdmin: boolean;
  hasPermission: (permissionCode: string) => boolean;
};

export type ChannelSessionRecord = {
  id: string;
  company_id: string;
  company_channel_id: string;
  conversation_id: string;
  channel_key: string;
  external_thread_id: string;
  sender_external_id: string | null;
  session_status: ChannelSessionStatus;
  metadata: Record<string, unknown>;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ChannelInboundEventRecord = {
  id: string;
  company_id: string;
  company_channel_id: string;
  channel_key: string;
  idempotency_key: string;
  external_thread_id: string;
  external_message_id: string | null;
  sender_external_id: string | null;
  processing_status: InboundProcessingStatus;
  conversation_id: string | null;
  channel_session_id: string | null;
  incoming_message_id: string | null;
  runtime_execution_id: string | null;
  payload: Record<string, unknown>;
  error_message: string | null;
  received_at: string;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ChannelDeliveryEventRecord = {
  id: string;
  company_id: string;
  company_channel_id: string;
  channel_key: string;
  conversation_id: string;
  channel_session_id: string | null;
  outbound_message_id: string | null;
  external_thread_id: string;
  external_message_id: string | null;
  delivery_status: DeliveryStatus;
  attempt_count: number;
  payload: Record<string, unknown>;
  provider_response: Record<string, unknown>;
  error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ResolvedCompanyChannel = {
  id: string;
  companyId: string;
  channelKey: string;
  displayName: string;
  isEnabled: boolean;
  provider: string;
  configuration: Record<string, unknown>;
};

export type ConversationMessageSummary = {
  id: string;
  conversationId: string;
  messageType: string;
  content: string;
  createdAt: string;
  /** True when an existing row was returned for the same external message id. */
  reused?: boolean;
};

export type RuntimeExecutionSummary = {
  executionId: string;
  responseContent: string;
  correlationId: string;
};
