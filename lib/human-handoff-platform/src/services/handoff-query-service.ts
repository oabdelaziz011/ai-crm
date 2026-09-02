import { HANDOFF_PERMISSIONS, HANDOFF_QUERY_CACHE_TTL } from "../constants.js";
import type { HandoffQueryCachePort } from "../cache/handoff-query-cache-port.js";
import { buildHandoffQueryCacheKey } from "../cache/handoff-query-cache-port.js";
import type { HandoffRepository } from "../repositories/handoff-repository-port.js";
import type {
  AgentPresenceRecord,
  AgentWorkspace,
  ConversationOwner,
  HandoffMetricsSnapshot,
  HandoffServiceContext,
  OwnershipHistoryRecord,
  QueuePosition,
} from "../types/handoff-types.js";
import { toConversationOwner } from "../types/handoff-types.js";
import { assertHandoffCompanyAccess, assertHandoffPermission } from "../validators/handoff-guards.js";
import { estimateWaitTimeSeconds } from "./queue-routing-engine.js";

export type HandoffQueryServiceDeps = {
  handoff: HandoffRepository;
  cache: HandoffQueryCachePort;
};

export class HandoffQueryService {
  constructor(private readonly deps: HandoffQueryServiceDeps) {}

  async getOwnership(
    ctx: HandoffServiceContext,
    input: { companyId: string; conversationId: string },
  ): Promise<{ ownership: ConversationOwner | null }> {
    assertHandoffCompanyAccess(ctx, input.companyId);
    assertHandoffPermission(ctx, HANDOFF_PERMISSIONS.view);

    const cacheKey = buildHandoffQueryCacheKey({
      kind: "ownership",
      companyId: input.companyId,
      conversationId: input.conversationId,
    });
    const cached = await this.deps.cache.get<ConversationOwner | null>(cacheKey);
    if (cached !== undefined) return { ownership: cached };

    const record = await this.deps.handoff.getOwnership(input.companyId, input.conversationId);
    const ownership = record ? toConversationOwner(record) : null;
    await this.deps.cache.set(cacheKey, ownership, HANDOFF_QUERY_CACHE_TTL.ownership);
    return { ownership };
  }

  async getOwnershipHistory(
    ctx: HandoffServiceContext,
    input: { companyId: string; conversationId: string; limit?: number },
  ): Promise<{ history: OwnershipHistoryRecord[] }> {
    assertHandoffCompanyAccess(ctx, input.companyId);
    assertHandoffPermission(ctx, HANDOFF_PERMISSIONS.view);
    const history = await this.deps.handoff.listOwnershipHistory(
      input.companyId,
      input.conversationId,
      input.limit ?? 50,
    );
    return { history };
  }

  async getAgentWorkspace(
    ctx: HandoffServiceContext,
    input: { companyId: string; conversationId: string },
  ): Promise<AgentWorkspace> {
    assertHandoffCompanyAccess(ctx, input.companyId);
    assertHandoffPermission(ctx, HANDOFF_PERMISSIONS.view);

    const cacheKey = buildHandoffQueryCacheKey({
      kind: "workspace",
      companyId: input.companyId,
      conversationId: input.conversationId,
    });
    const cached = await this.deps.cache.get<AgentWorkspace>(cacheKey);
    if (cached) return cached;

    const ownershipRecord = await this.deps.handoff.getOwnership(input.companyId, input.conversationId);
    const context = await this.deps.handoff.getLatestContextSnapshot(input.companyId, input.conversationId);
    const pendingRequest = await this.deps.handoff.getPendingRequest(input.companyId, input.conversationId);

    const workspace: AgentWorkspace = {
      conversationId: input.conversationId,
      ownership: ownershipRecord
        ? toConversationOwner(ownershipRecord)
        : {
            ownerType: "system",
            ownerId: null,
            ownerLabel: "Unassigned",
            queueId: null,
            assignedUserId: null,
            aiAssistantId: null,
            lifecycleState: "NEW",
            isPaused: false,
          },
      context,
      pendingRequest,
      openTickets: context?.payload.openTickets ?? [],
      appointments: context?.payload.appointments ?? [],
    };

    await this.deps.cache.set(cacheKey, workspace, HANDOFF_QUERY_CACHE_TTL.workspace);
    return workspace;
  }

  async listQueues(
    ctx: HandoffServiceContext,
    input: { companyId: string; activeOnly?: boolean },
  ) {
    assertHandoffCompanyAccess(ctx, input.companyId);
    assertHandoffPermission(ctx, HANDOFF_PERMISSIONS.view);
    const queues = await this.deps.handoff.listQueues(input.companyId, input.activeOnly ?? true);
    return { queues };
  }

  async listQueueMembers(
    ctx: HandoffServiceContext,
    input: { companyId: string; queueId: string },
  ) {
    assertHandoffCompanyAccess(ctx, input.companyId);
    assertHandoffPermission(ctx, HANDOFF_PERMISSIONS.view);
    const members = await this.deps.handoff.listQueueMembers(input.companyId, input.queueId);
    return { members };
  }

  async getQueuePosition(
    ctx: HandoffServiceContext,
    input: { companyId: string; conversationId: string; queueId: string },
  ): Promise<QueuePosition> {
    assertHandoffCompanyAccess(ctx, input.companyId);
    assertHandoffPermission(ctx, HANDOFF_PERMISSIONS.view);

    const queueSize = await this.deps.handoff.countQueueWaiting(input.companyId, input.queueId);
    const members = await this.deps.handoff.listQueueMembers(input.companyId, input.queueId);
    const presence = await this.deps.handoff.listPresence(input.companyId, ["online"]);
    const availableAgents = members.filter((member) =>
      presence.some((row) => row.userId === member.userId),
    ).length;

    return {
      queueId: input.queueId,
      position: queueSize,
      estimatedWaitSeconds: estimateWaitTimeSeconds(queueSize, availableAgents),
      queueSize,
    };
  }

  async listPendingRequests(
    ctx: HandoffServiceContext,
    input: { companyId: string; assigneeUserId?: string; queueId?: string; limit?: number },
  ) {
    assertHandoffCompanyAccess(ctx, input.companyId);
    assertHandoffPermission(ctx, HANDOFF_PERMISSIONS.view);
    const requests = await this.deps.handoff.listPendingRequests({
      companyId: input.companyId,
      assigneeUserId: input.assigneeUserId,
      queueId: input.queueId,
      limit: input.limit ?? 50,
    });
    return { requests };
  }

  async getAgentPresence(
    ctx: HandoffServiceContext,
    input: { companyId: string; userId: string },
  ): Promise<{ presence: AgentPresenceRecord | null }> {
    assertHandoffCompanyAccess(ctx, input.companyId);
    assertHandoffPermission(ctx, HANDOFF_PERMISSIONS.view);
    const presence = await this.deps.handoff.getPresence(input.companyId, input.userId);
    return { presence };
  }

  async listAgentPresence(
    ctx: HandoffServiceContext,
    input: { companyId: string; states?: AgentPresenceRecord["state"][] },
  ) {
    assertHandoffCompanyAccess(ctx, input.companyId);
    assertHandoffPermission(ctx, HANDOFF_PERMISSIONS.view);
    const agents = await this.deps.handoff.listPresence(input.companyId, input.states);
    return { agents };
  }

  async listEscalationRules(
    ctx: HandoffServiceContext,
    input: { companyId: string; activeOnly?: boolean },
  ) {
    assertHandoffCompanyAccess(ctx, input.companyId);
    assertHandoffPermission(ctx, HANDOFF_PERMISSIONS.view);
    const rules = await this.deps.handoff.listEscalationRules(input.companyId, input.activeOnly ?? true);
    return { rules };
  }

  async fetchMetrics(
    ctx: HandoffServiceContext,
    input: { companyId: string; periodStartIso?: string },
  ): Promise<HandoffMetricsSnapshot> {
    assertHandoffCompanyAccess(ctx, input.companyId);
    assertHandoffPermission(ctx, HANDOFF_PERMISSIONS.view);

    const periodStartIso = input.periodStartIso ?? new Date(Date.now() - 30 * 86400000).toISOString();
    const cacheKey = buildHandoffQueryCacheKey({
      kind: "metrics",
      companyId: input.companyId,
      periodStart: periodStartIso,
    });
    const cached = await this.deps.cache.get<HandoffMetricsSnapshot>(cacheKey);
    if (cached) return cached;

    const metrics = await this.deps.handoff.fetchMetrics(input.companyId, periodStartIso);
    await this.deps.cache.set(cacheKey, metrics, HANDOFF_QUERY_CACHE_TTL.metrics);
    return metrics;
  }
}
