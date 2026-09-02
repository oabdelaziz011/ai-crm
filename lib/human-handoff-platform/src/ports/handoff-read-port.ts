import type {
  AgentPresenceRecord,
  AgentWorkspace,
  ConversationOwner,
  EscalationRuleRecord,
  HandoffMetricsSnapshot,
  HandoffQueueRecord,
  HandoffRequestRecord,
  HandoffServiceContext,
  OwnershipHistoryRecord,
  QueuePosition,
} from "../types/handoff-types.js";

export type HandoffReadAccessContext = HandoffServiceContext;

export interface HandoffReadPort {
  getOwnership(
    access: HandoffReadAccessContext,
    input: { companyId: string; conversationId: string },
  ): Promise<{ ownership: ConversationOwner | null }>;

  getOwnershipHistory(
    access: HandoffReadAccessContext,
    input: { companyId: string; conversationId: string; limit?: number },
  ): Promise<{ history: OwnershipHistoryRecord[] }>;

  getAgentWorkspace(
    access: HandoffReadAccessContext,
    input: { companyId: string; conversationId: string },
  ): Promise<AgentWorkspace>;

  listQueues(
    access: HandoffReadAccessContext,
    input: { companyId: string; activeOnly?: boolean },
  ): Promise<{ queues: HandoffQueueRecord[] }>;

  listQueueMembers(
    access: HandoffReadAccessContext,
    input: { companyId: string; queueId: string },
  ): Promise<{ members: import("../types/handoff-types.js").QueueMemberRecord[] }>;

  getQueuePosition(
    access: HandoffReadAccessContext,
    input: { companyId: string; conversationId: string; queueId: string },
  ): Promise<QueuePosition>;

  listPendingRequests(
    access: HandoffReadAccessContext,
    input: { companyId: string; assigneeUserId?: string; queueId?: string; limit?: number },
  ): Promise<{ requests: HandoffRequestRecord[] }>;

  getAgentPresence(
    access: HandoffReadAccessContext,
    input: { companyId: string; userId: string },
  ): Promise<{ presence: AgentPresenceRecord | null }>;

  listAgentPresence(
    access: HandoffReadAccessContext,
    input: { companyId: string; states?: AgentPresenceRecord["state"][] },
  ): Promise<{ agents: AgentPresenceRecord[] }>;

  listEscalationRules(
    access: HandoffReadAccessContext,
    input: { companyId: string; activeOnly?: boolean },
  ): Promise<{ rules: EscalationRuleRecord[] }>;

  fetchMetrics(
    access: HandoffReadAccessContext,
    input: { companyId: string; periodStartIso?: string },
  ): Promise<HandoffMetricsSnapshot>;
}
