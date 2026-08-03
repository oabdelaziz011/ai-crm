import type {
  ESCALATION_TRIGGERS,
  HANDOFF_REQUEST_STATUSES,
  HANDOFF_REQUEST_TYPES,
  LIFECYCLE_STATES,
  OWNER_TYPES,
  PRESENCE_STATES,
  ROUTING_STRATEGIES,
} from "../constants.js";

export type OwnerType = (typeof OWNER_TYPES)[number];
export type RoutingStrategy = (typeof ROUTING_STRATEGIES)[number];
export type PresenceState = (typeof PRESENCE_STATES)[number];
export type EscalationTrigger = (typeof ESCALATION_TRIGGERS)[number];
export type HandoffRequestType = (typeof HANDOFF_REQUEST_TYPES)[number];
export type HandoffRequestStatus = (typeof HANDOFF_REQUEST_STATUSES)[number];
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

export type HandoffServiceContext = {
  userId: string | null;
  companyId: string | null;
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
};

export type ConversationOwner = {
  ownerType: OwnerType;
  ownerId: string | null;
  ownerLabel: string;
  queueId: string | null;
  assignedUserId: string | null;
  aiAssistantId: string | null;
  lifecycleState: LifecycleState;
  isPaused: boolean;
};

export type OwnershipRecord = ConversationOwner & {
  id: string;
  companyId: string;
  conversationId: string;
  pausedAt: string | null;
  pausedReason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type OwnershipHistoryRecord = {
  id: string;
  companyId: string;
  conversationId: string;
  previousOwnerType: OwnerType | null;
  previousOwnerId: string | null;
  newOwnerType: OwnerType;
  newOwnerId: string | null;
  transitionAction: string;
  transitionReason: string;
  actorUserId: string | null;
  contextSnapshotId: string | null;
  createdAt: string;
};

export type HandoffQueueRecord = {
  id: string;
  companyId: string;
  name: string;
  slug: string;
  description: string;
  routingStrategy: RoutingStrategy;
  departmentId: string | null;
  maxQueueSize: number;
  overflowQueueId: string | null;
  businessHours: Record<string, unknown>;
  skills: string[];
  languages: string[];
  priorityWeight: number;
  isActive: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type QueueMemberRecord = {
  id: string;
  queueId: string;
  companyId: string;
  userId: string;
  skills: string[];
  languages: string[];
  isActive: boolean;
  lastAssignedAt: string | null;
  activeConversationCount: number;
};

export type HandoffRequestRecord = {
  id: string;
  companyId: string;
  conversationId: string;
  requestType: HandoffRequestType;
  status: HandoffRequestStatus;
  fromOwnerType: OwnerType | null;
  fromOwnerId: string | null;
  toOwnerType: OwnerType | null;
  toOwnerId: string | null;
  toQueueId: string | null;
  reason: string;
  escalationReasonCode: string | null;
  priority: string;
  contextSnapshotId: string | null;
  requestedByUserId: string | null;
  requestedByAiAssistantId: string | null;
  acceptedByUserId: string | null;
  rejectedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
};

export type ContextSnapshotRecord = {
  id: string;
  companyId: string;
  conversationId: string;
  summary: string;
  suggestedResolution: string;
  suggestedReply: string;
  payload: HandoffContextPayload;
  createdAt: string;
};

export type HandoffContextPayload = {
  conversationHistory?: unknown[];
  customerProfile?: Record<string, unknown>;
  customer360?: Record<string, unknown>;
  memory?: Record<string, unknown>;
  knowledgeRetrieved?: unknown[];
  toolsUsed?: unknown[];
  reasonForEscalation?: string;
  openTickets?: unknown[];
  appointments?: unknown[];
  workflowState?: Record<string, unknown>;
  runtimeMetadata?: Record<string, unknown>;
  previousAiActions?: unknown[];
};

export type AgentPresenceRecord = {
  id: string;
  companyId: string;
  userId: string;
  state: PresenceState;
  viewingConversationId: string | null;
  lastHeartbeatAt: string | null;
  lastSeenAt: string | null;
  metadata: Record<string, unknown>;
  updatedAt: string;
};

export type EscalationRuleRecord = {
  id: string;
  companyId: string;
  name: string;
  triggerCode: EscalationTrigger;
  targetQueueId: string | null;
  targetLevel: string;
  priorityBoost: string;
  conditions: Record<string, unknown>;
  isActive: boolean;
};

export type QueuePosition = {
  queueId: string;
  position: number;
  estimatedWaitSeconds: number;
  queueSize: number;
};

export type AgentWorkspace = {
  conversationId: string;
  ownership: ConversationOwner;
  context: ContextSnapshotRecord | null;
  pendingRequest: HandoffRequestRecord | null;
  openTickets: unknown[];
  appointments: unknown[];
};

export type HandoffMetricsSnapshot = {
  transferCount: number;
  escalationReasons: Record<string, number>;
  escalationCount: number;
  averageWaitTimeSeconds: number;
  queuePerformance: Array<{
    queueId: string;
    queueName: string;
    waitingCount: number;
    assignedCount: number;
  }>;
  aiResolutionRate: number;
  humanResolutionRate: number;
  agentUtilization: Array<{
    userId: string;
    state: PresenceState;
    activeConversations: number;
  }>;
};

export function toConversationOwner(record: OwnershipRecord): ConversationOwner {
  return {
    ownerType: record.ownerType,
    ownerId: record.ownerId,
    ownerLabel: record.ownerLabel,
    queueId: record.queueId,
    assignedUserId: record.assignedUserId,
    aiAssistantId: record.aiAssistantId,
    lifecycleState: record.lifecycleState,
    isPaused: record.isPaused,
  };
}
