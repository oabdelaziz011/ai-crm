import type {
  AgentPresenceRecord,
  ContextSnapshotRecord,
  EscalationRuleRecord,
  HandoffContextPayload,
  HandoffMetricsSnapshot,
  HandoffQueueRecord,
  HandoffRequestRecord,
  HandoffRequestStatus,
  HandoffRequestType,
  LifecycleState,
  OwnerType,
  OwnershipHistoryRecord,
  OwnershipRecord,
  PresenceState,
  QueueMemberRecord,
  RoutingStrategy,
} from "../types/handoff-types.js";

export interface HandoffRepository {
  getOwnership(companyId: string, conversationId: string): Promise<OwnershipRecord | null>;
  upsertOwnership(input: {
    companyId: string;
    conversationId: string;
    ownerType: OwnerType;
    ownerId: string | null;
    ownerLabel: string;
    queueId?: string | null;
    lifecycleState: LifecycleState;
    assignedUserId?: string | null;
    aiAssistantId?: string | null;
    isPaused?: boolean;
    pausedAt?: string | null;
    pausedReason?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<OwnershipRecord>;

  appendOwnershipHistory(input: {
    companyId: string;
    conversationId: string;
    previousOwnerType: OwnerType | null;
    previousOwnerId: string | null;
    newOwnerType: OwnerType;
    newOwnerId: string | null;
    transitionAction: string;
    transitionReason: string;
    actorUserId: string | null;
    contextSnapshotId?: string | null;
  }): Promise<OwnershipHistoryRecord>;

  listOwnershipHistory(
    companyId: string,
    conversationId: string,
    limit: number,
  ): Promise<OwnershipHistoryRecord[]>;

  createRequest(input: {
    companyId: string;
    conversationId: string;
    requestType: HandoffRequestType;
    fromOwnerType: OwnerType | null;
    fromOwnerId: string | null;
    toOwnerType: OwnerType | null;
    toOwnerId: string | null;
    toQueueId?: string | null;
    reason: string;
    escalationReasonCode?: string | null;
    priority?: string;
    contextSnapshotId?: string | null;
    requestedByUserId?: string | null;
    requestedByAiAssistantId?: string | null;
    expiresAt?: string | null;
  }): Promise<HandoffRequestRecord>;

  updateRequestStatus(input: {
    companyId: string;
    requestId: string;
    status: HandoffRequestStatus;
    acceptedByUserId?: string | null;
    rejectedByUserId?: string | null;
  }): Promise<HandoffRequestRecord>;

  getRequest(companyId: string, requestId: string): Promise<HandoffRequestRecord | null>;
  getPendingRequest(companyId: string, conversationId: string): Promise<HandoffRequestRecord | null>;
  listPendingRequests(input: {
    companyId: string;
    assigneeUserId?: string;
    queueId?: string;
    limit: number;
  }): Promise<HandoffRequestRecord[]>;

  createContextSnapshot(input: {
    companyId: string;
    conversationId: string;
    summary: string;
    suggestedResolution: string;
    suggestedReply: string;
    payload: HandoffContextPayload;
  }): Promise<ContextSnapshotRecord>;

  getLatestContextSnapshot(companyId: string, conversationId: string): Promise<ContextSnapshotRecord | null>;

  listQueues(companyId: string, activeOnly: boolean): Promise<HandoffQueueRecord[]>;
  getQueue(companyId: string, queueId: string): Promise<HandoffQueueRecord | null>;
  countQueueWaiting(companyId: string, queueId: string): Promise<number>;
  listQueueMembers(companyId: string, queueId: string): Promise<QueueMemberRecord[]>;
  incrementMemberAssignment(queueId: string, userId: string): Promise<void>;
  syncMemberActiveConversationCount(companyId: string, userId: string): Promise<void>;

  upsertPresence(input: {
    companyId: string;
    userId: string;
    state: PresenceState;
    viewingConversationId?: string | null;
    lastHeartbeatAt?: string | null;
  }): Promise<AgentPresenceRecord>;

  getPresence(companyId: string, userId: string): Promise<AgentPresenceRecord | null>;
  listPresence(companyId: string, states?: PresenceState[]): Promise<AgentPresenceRecord[]>;
  expireStalePresence(companyId: string, cutoffIso: string): Promise<number>;

  listEscalationRules(companyId: string, activeOnly: boolean): Promise<EscalationRuleRecord[]>;
  findEscalationRule(companyId: string, triggerCode: string): Promise<EscalationRuleRecord | null>;

  fetchMetrics(companyId: string, periodStartIso: string): Promise<HandoffMetricsSnapshot>;
}

export type CreateQueueInput = {
  companyId: string;
  name: string;
  slug: string;
  routingStrategy: RoutingStrategy;
  maxQueueSize?: number;
  overflowQueueId?: string | null;
};
