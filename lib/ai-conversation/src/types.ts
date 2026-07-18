import type {
  ConversationChannelType,
  ConversationPriority,
  ConversationState,
  MessageContentType,
  MessageStatus,
  MessageType,
  ParticipantType,
} from "./constants.js";
import type { StateTransitionAuditEvent, TransitionTrigger } from "./state-machine/transitions.js";

export type ConversationRecord = {
  id: string;
  company_id: string;
  conversation_number: string;
  company_channel_id: string | null;
  ai_assistant_id: string;
  channel_type: ConversationChannelType;
  channel_instance_id: string | null;
  state: ConversationState;
  external_thread_id: string | null;
  customer_id: string | null;
  assigned_user_id: string | null;
  metadata: Record<string, unknown>;
  priority: ConversationPriority;
  locked_by: string | null;
  locked_at: string | null;
  unread_count_employee: number;
  unread_count_customer: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_participant_type: ParticipantType | null;
  search_text: string;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
};

export type ConversationParticipantRecord = {
  id: string;
  conversation_id: string;
  participant_type: ParticipantType;
  display_name: string | null;
  profile_ref: string | null;
  external_participant_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
};

export type ConversationMessageRecord = {
  id: string;
  conversation_id: string;
  participant_id: string | null;
  sequence_number: number;
  message_type: MessageType;
  content_type: MessageContentType;
  content: string;
  metadata: Record<string, unknown>;
  status: MessageStatus;
  external_message_id: string | null;
  attachment_type: string | null;
  attachment_url: string | null;
  mime_type: string | null;
  file_size: number | null;
  search_text: string;
  created_at: string;
  created_by: string | null;
};

export type CreateConversationInput = {
  companyId: string;
  aiAssistantId: string;
  channelType: ConversationChannelType;
  companyChannelId?: string | null;
  channelInstanceId?: string | null;
  externalThreadId?: string | null;
  customerId?: string | null;
  metadata?: Record<string, unknown>;
  priority?: ConversationPriority;
  initialState?: ConversationState;
  createdBy?: string | null;
};

export type ListConversationsFilter = {
  companyId: string;
  state?: ConversationState;
  channelType?: ConversationChannelType;
  assignedUserId?: string | null;
  priority?: ConversationPriority;
  hasEmployeeUnread?: boolean;
  hasCustomerUnread?: boolean;
  searchQuery?: string;
  limit?: number;
  offset?: number;
};

export type AddParticipantInput = {
  conversationId: string;
  participantType: ParticipantType;
  displayName?: string | null;
  profileRef?: string | null;
  externalParticipantId?: string | null;
  metadata?: Record<string, unknown>;
  createdBy?: string | null;
};

export type AddMessageInput = {
  conversationId: string;
  participantId?: string | null;
  messageType: MessageType;
  content: string;
  contentType?: MessageContentType;
  metadata?: Record<string, unknown>;
  status?: MessageStatus;
  externalMessageId?: string | null;
  attachmentType?: string | null;
  attachmentUrl?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  createdBy?: string | null;
};

export type ListMessagesFilter = {
  conversationId: string;
  limit?: number;
  offset?: number;
  markEmployeeRead?: boolean;
  markCustomerRead?: boolean;
};

export type AssignConversationInput = {
  conversationId: string;
  assignedUserId: string;
  updatedBy?: string | null;
  state?: ConversationState;
};

export type ReleaseConversationInput = {
  conversationId: string;
  updatedBy?: string | null;
  state?: ConversationState;
};

export type CloseConversationInput = {
  conversationId: string;
  updatedBy?: string | null;
};

export type UpdateConversationStateInput = {
  conversationId: string;
  state: ConversationState;
  updatedBy?: string | null;
};

export type StateEngineMetadata = {
  last_trigger: string;
  last_audit_event: string;
  last_transition_at: string;
  from_state: ConversationState;
  to_state: ConversationState;
};

export type ApplyStateTransitionInput = {
  conversationId: string;
  fromState: ConversationState;
  toState: ConversationState;
  trigger: string;
  auditEvent: string;
  metadata: Record<string, unknown>;
  updatedBy?: string | null;
};

export type StateTransitionInput = {
  conversationId: string;
  trigger: TransitionTrigger;
  updatedBy?: string | null;
};

export type StateTransitionResult = {
  conversation: ConversationRecord;
  fromState: ConversationState;
  toState: ConversationState;
  trigger: TransitionTrigger;
  auditEvent: StateTransitionAuditEvent;
};

export type UpdateConversationPriorityInput = {
  conversationId: string;
  priority: ConversationPriority;
  updatedBy?: string | null;
};

export type UpdateConversationMetadataInput = {
  conversationId: string;
  metadata: Record<string, unknown>;
  updatedBy?: string | null;
};

export type ApplyMessageCacheInput = {
  conversationId: string;
  messageAt: string;
  preview: string;
  participantType: ParticipantType | null;
  messageType: MessageType;
  conversationNumber: string;
  externalThreadId?: string | null;
  currentUnreadEmployee: number;
  currentUnreadCustomer: number;
};

export type ServiceContext = {
  userId: string | null;
  companyId: string | null;
  isSuperAdmin: boolean;
  hasPermission: (permissionCode: string) => boolean;
};
