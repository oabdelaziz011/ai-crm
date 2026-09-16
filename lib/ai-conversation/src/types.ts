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
  /** Durable department ownership (Model D). Snapshot at first create; may be null. */
  department_id: string | null;
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
  /**
   * Durable department ownership for first create only.
   * Omit / null for outbound compose and unclassified inbound.
   * Must never be used to overwrite an existing conversation.
   */
  departmentId?: string | null;
  metadata?: Record<string, unknown>;
  priority?: ConversationPriority;
  initialState?: ConversationState;
  createdBy?: string | null;
};

/**
 * Internal list constraint for View Assigned (+ department queue / manager scope).
 * Built by applyConversationListVisibilityFilter — not a client widening lever.
 */
export type ConversationListVisibilityConstraint = {
  userId: string;
  departmentId: string | null;
  managedDepartmentIds: readonly string[];
};

export type ListConversationsFilter = {
  companyId: string;
  state?: ConversationState;
  channelType?: ConversationChannelType;
  /** CRM Customer 360 / customer-linked lists. Does not widen visibility. */
  customerId?: string | null;
  assignedUserId?: string | null;
  priority?: ConversationPriority;
  hasEmployeeUnread?: boolean;
  hasCustomerUnread?: boolean;
  searchQuery?: string;
  limit?: number;
  offset?: number;
  /**
   * Server-applied visibility OR predicate for View Assigned.
   * Prefer setting via applyConversationListVisibilityFilter only.
   */
  visibilityConstraint?: ConversationListVisibilityConstraint | null;
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

export type AssignmentAuditSource = "human" | "handoff" | "ai" | "system";

/**
 * Non-serializable trust token for Assignment Governance / visibility bypass.
 * JSON/HTTP bodies cannot carry Symbols — client spoofing of skip flags is rejected.
 */
export const ASSIGNMENT_INTERNAL_TRUST: unique symbol = Symbol.for(
  "valueor.assignment.internal.trust",
);

export type AssignConversationInput = {
  conversationId: string;
  assignedUserId: string;
  updatedBy?: string | null;
  state?: ConversationState;
  /**
   * @deprecated Ignored on public assignConversation. Use assignConversationInternal
   * with ASSIGNMENT_INTERNAL_TRUST for trusted AI/queue/system paths only.
   */
  skipAssignmentGovernance?: boolean;
  /** Defaults to human when unset. */
  assignmentAuditSource?: AssignmentAuditSource;
  skipAssignmentAudit?: boolean;
};

/** Trusted internal assign — requires ASSIGNMENT_INTERNAL_TRUST (not client-forgeable via JSON). */
export type AssignConversationInternalInput = AssignConversationInput & {
  internalTrust: typeof ASSIGNMENT_INTERNAL_TRUST;
  /** When true (and trust token valid), skip AG + visibility compatibility. */
  skipAssignmentGovernance?: boolean;
};


export type ReleaseConversationInput = {
  conversationId: string;
  updatedBy?: string | null;
  state?: ConversationState;
  assignmentAuditSource?: AssignmentAuditSource;
  skipAssignmentAudit?: boolean;
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
  /** When set, written atomically with priority (SLA dueAt refresh). */
  metadata?: Record<string, unknown>;
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
  /**
   * Actor profiles.department_id for View Assigned department unassigned queue.
   * Optional — when absent/null, department-queue visibility is fail-closed.
   */
  departmentId?: string | null;
  /**
   * Active organization_departments.id where manager_user_id = actor
   * (same definition as AssignmentGovernanceDataPort.listManagedDepartmentIds).
   */
  managedDepartmentIds?: readonly string[];
};
