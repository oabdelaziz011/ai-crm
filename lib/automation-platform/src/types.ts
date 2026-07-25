import type {
  AutomationChannel,
  AutomationFlowStatus,
  AutomationMessageType,
  AutomationNodeType,
  AutomationRunStatus,
  AutomationSenderType,
  AutomationSessionStatus,
  AutomationTriggerType,
  ExecutionLifecycleStatus,
  OrchestratorTriggerType,
} from "./constants.js";

export type ServiceContext = {
  userId: string | null;
  companyId: string | null;
  isSuperAdmin: boolean;
  hasPermission: (permissionCode: string) => boolean;
};

export type AutomationFlowRecord = {
  id: string;
  company_id: string;
  name: string;
  description: string;
  trigger_type: AutomationTriggerType;
  status: AutomationFlowStatus;
  version: number;
  active_version_id: string | null;
  has_unpublished_draft: boolean;
  metadata: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
};

export type AutomationNodeRecord = {
  id: string;
  flow_id: string;
  type: AutomationNodeType;
  config: Record<string, unknown>;
  position_x: number;
  position_y: number;
  created_at: string;
};

export type AutomationEdgeRecord = {
  id: string;
  flow_id: string;
  source_node_id: string;
  target_node_id: string;
  condition: Record<string, unknown>;
  created_at: string;
};

export type AutomationRunRecord = {
  id: string;
  company_id: string;
  flow_id: string;
  status: AutomationRunStatus;
  trigger_source: string;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  flow_version_id: string | null;
  current_node_id: string | null;
  session_id: string | null;
  variables: Record<string, unknown>;
};

export type ConversationSessionRecord = {
  id: string;
  company_id: string;
  channel: AutomationChannel;
  external_user_id: string | null;
  customer_id: string | null;
  flow_id: string | null;
  flow_version_id: string | null;
  run_id: string | null;
  current_node_id: string | null;
  status: AutomationSessionStatus;
  started_at: string;
  last_activity_at: string;
  metadata: Record<string, unknown>;
  variables: Record<string, unknown>;
};

/** Spec alias: conversation_messages → automation_session_messages table */
export type ConversationMessageRecord = {
  id: string;
  session_id: string;
  sender_type: AutomationSenderType;
  message_type: AutomationMessageType;
  payload: Record<string, unknown>;
  created_at: string;
};

export type CreateAutomationFlowInput = {
  companyId: string;
  name: string;
  description?: string;
  triggerType: AutomationTriggerType;
  metadata?: Record<string, unknown>;
  createdBy?: string | null;
};

export type UpdateAutomationFlowInput = {
  flowId: string;
  name?: string;
  description?: string;
  triggerType?: AutomationTriggerType;
  metadata?: Record<string, unknown>;
  updatedBy?: string | null;
  activeVersionId?: string | null;
  version?: number;
  hasUnpublishedDraft?: boolean;
  status?: AutomationFlowStatus;
};

export type ListAutomationFlowsFilter = {
  companyId: string;
  status?: AutomationFlowStatus;
  triggerType?: AutomationTriggerType;
  search?: string;
};

export type SoftDeleteInput = {
  id: string;
  deletedBy?: string | null;
};

export type CreateAutomationNodeInput = {
  flowId: string;
  type: AutomationNodeType;
  config?: Record<string, unknown>;
  positionX?: number;
  positionY?: number;
};

export type CreateAutomationEdgeInput = {
  flowId: string;
  sourceNodeId: string;
  targetNodeId: string;
  condition?: Record<string, unknown>;
};

export type CreateAutomationRunInput = {
  companyId: string;
  flowId: string;
  triggerSource?: string;
  status?: AutomationRunStatus;
  metadata?: Record<string, unknown>;
  variables?: Record<string, unknown>;
  flowVersionId?: string | null;
  currentNodeId?: string | null;
  sessionId?: string | null;
};

export type CreateConversationSessionInput = {
  companyId: string;
  channel: AutomationChannel;
  externalUserId?: string | null;
  customerId?: string | null;
  flowId?: string | null;
  flowVersionId?: string | null;
  runId?: string | null;
  currentNodeId?: string | null;
  status?: AutomationSessionStatus;
  metadata?: Record<string, unknown>;
  variables?: Record<string, unknown>;
};

export type CreateConversationMessageInput = {
  sessionId: string;
  senderType: AutomationSenderType;
  messageType?: AutomationMessageType;
  payload?: Record<string, unknown>;
};

export type ListAutomationRunsFilter = {
  companyId: string;
  flowId?: string;
  status?: AutomationRunStatus;
};

export type ListConversationSessionsFilter = {
  companyId: string;
  flowId?: string;
  status?: AutomationSessionStatus;
  channel?: AutomationChannel;
  externalUserId?: string;
  activeOnly?: boolean;
};

export type ListConversationMessagesFilter = {
  sessionId: string;
};

export type UpdateAutomationRunStateInput = {
  runId: string;
  status?: AutomationRunStatus;
  flowVersionId?: string | null;
  currentNodeId?: string | null;
  sessionId?: string | null;
  variables?: Record<string, unknown>;
  errorMessage?: string | null;
  finishedAt?: string | null;
  metadata?: Record<string, unknown>;
};

export type UpdateConversationSessionStateInput = {
  sessionId: string;
  status?: AutomationSessionStatus;
  flowVersionId?: string | null;
  currentNodeId?: string | null;
  runId?: string | null;
  variables?: Record<string, unknown>;
  lastActivityAt?: string;
  metadata?: Record<string, unknown>;
};

export type StartAutomationExecutionInput = {
  companyId: string;
  flowId: string;
  channel: AutomationChannel;
  triggerSource?: string;
  externalUserId?: string | null;
  customerId?: string | null;
  initialVariables?: Record<string, unknown>;
};

export type ResumeAutomationExecutionInput = {
  runId: string;
  input: Record<string, unknown>;
};

export type AutomationExecutionResult = {
  lifecycle: ExecutionLifecycleStatus;
  run: AutomationRunRecord;
  session: ConversationSessionRecord;
  currentNodeId: string | null;
  variables: Record<string, unknown>;
};

export type NormalizedInboundMessage = {
  channel: AutomationChannel;
  companyId: string;
  externalUserId: string;
  customerId?: string | null;
  messageType: AutomationMessageType;
  text: string;
  payload: Record<string, unknown>;
  receivedAt: string;
  externalMessageId?: string | null;
};

export type NormalizedOutboundMessage = {
  channel: AutomationChannel;
  companyId: string;
  sessionId: string;
  externalUserId: string;
  messageType: AutomationMessageType;
  text: string;
  payload?: Record<string, unknown>;
};

export type ConversationResolution = {
  companyId: string;
  customerId: string | null;
  session: ConversationSessionRecord | null;
  run: AutomationRunRecord | null;
  expired: boolean;
  created: boolean;
};

export type TriggerDispatchInput = {
  companyId: string;
  channel: AutomationChannel;
  trigger: OrchestratorTriggerType;
  externalUserId?: string | null;
  customerId?: string | null;
  flowId?: string;
  triggerSource?: string;
  initialVariables?: Record<string, unknown>;
};

export type OrchestratorInboundInput = {
  companyId: string;
  rawMessage: unknown;
};

export type OrchestratorHandleResult = {
  inbound: NormalizedInboundMessage;
  resolution: ConversationResolution;
  execution: AutomationExecutionResult | null;
  outboundMessages: NormalizedOutboundMessage[];
};
