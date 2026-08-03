import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HandoffCommandService } from "../services/handoff-command-service.js";
import type { HandoffRepository } from "../repositories/handoff-repository-port.js";
import type {
  HandoffAgentResolverPort,
  HandoffAuditPort,
  HandoffContextAssemblyPort,
  HandoffConversationPort,
  HandoffEventPublisherPort,
  HandoffNotificationPort,
} from "../ports/handoff-platform-ports.js";
import type { OwnershipRecord } from "../types/handoff-types.js";

function createMemoryRepo(): HandoffRepository {
  const ownership = new Map<string, OwnershipRecord>();
  return {
    getOwnership: async (_companyId, conversationId) => ownership.get(conversationId) ?? null,
    upsertOwnership: async (input) => {
      const record: OwnershipRecord = {
        id: `own-${input.conversationId}`,
        companyId: input.companyId,
        conversationId: input.conversationId,
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        ownerLabel: input.ownerLabel,
        queueId: input.queueId ?? null,
        lifecycleState: input.lifecycleState,
        assignedUserId: input.assignedUserId ?? null,
        aiAssistantId: input.aiAssistantId ?? null,
        isPaused: input.isPaused ?? false,
        pausedAt: input.pausedAt ?? null,
        pausedReason: input.pausedReason ?? null,
        metadata: input.metadata ?? {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      ownership.set(input.conversationId, record);
      return record;
    },
    appendOwnershipHistory: async (input) => ({
      id: "hist-1",
      companyId: input.companyId,
      conversationId: input.conversationId,
      previousOwnerType: input.previousOwnerType,
      previousOwnerId: input.previousOwnerId,
      newOwnerType: input.newOwnerType,
      newOwnerId: input.newOwnerId,
      transitionAction: input.transitionAction,
      transitionReason: input.transitionReason,
      actorUserId: input.actorUserId,
      contextSnapshotId: input.contextSnapshotId ?? null,
      createdAt: new Date().toISOString(),
    }),
    listOwnershipHistory: async () => [],
    createRequest: async (input) => ({
      id: "req-1",
      companyId: input.companyId,
      conversationId: input.conversationId,
      requestType: input.requestType,
      status: "pending",
      fromOwnerType: input.fromOwnerType,
      fromOwnerId: input.fromOwnerId,
      toOwnerType: input.toOwnerType,
      toOwnerId: input.toOwnerId,
      toQueueId: input.toQueueId ?? null,
      reason: input.reason,
      escalationReasonCode: input.escalationReasonCode ?? null,
      priority: input.priority ?? "normal",
      contextSnapshotId: input.contextSnapshotId ?? null,
      requestedByUserId: input.requestedByUserId ?? null,
      requestedByAiAssistantId: input.requestedByAiAssistantId ?? null,
      acceptedByUserId: null,
      rejectedByUserId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: input.expiresAt ?? null,
    }),
    updateRequestStatus: async (input) => ({
      id: input.requestId,
      companyId: input.companyId,
      conversationId: "conv-1",
      requestType: "transfer",
      status: input.status,
      fromOwnerType: "ai_employee",
      fromOwnerId: "ai-1",
      toOwnerType: "human_agent",
      toOwnerId: "agent-1",
      toQueueId: null,
      reason: "test",
      escalationReasonCode: null,
      priority: "normal",
      contextSnapshotId: null,
      requestedByUserId: null,
      requestedByAiAssistantId: null,
      acceptedByUserId: input.acceptedByUserId ?? null,
      rejectedByUserId: input.rejectedByUserId ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: null,
    }),
    getRequest: async () => null,
    getPendingRequest: async () => null,
    listPendingRequests: async () => [],
    createContextSnapshot: async (input) => ({
      id: "ctx-1",
      companyId: input.companyId,
      conversationId: input.conversationId,
      summary: input.summary,
      suggestedResolution: input.suggestedResolution,
      suggestedReply: input.suggestedReply,
      payload: input.payload,
      createdAt: new Date().toISOString(),
    }),
    getLatestContextSnapshot: async () => null,
    listQueues: async () => [],
    getQueue: async () => null,
    countQueueWaiting: async () => 0,
    listQueueMembers: async () => [],
    incrementMemberAssignment: async () => {},
    upsertPresence: async (input) => ({
      id: "pres-1",
      companyId: input.companyId,
      userId: input.userId,
      state: input.state,
      viewingConversationId: input.viewingConversationId ?? null,
      lastHeartbeatAt: input.lastHeartbeatAt ?? null,
      lastSeenAt: new Date().toISOString(),
      metadata: {},
      updatedAt: new Date().toISOString(),
    }),
    getPresence: async () => null,
    listPresence: async () => [],
    expireStalePresence: async () => 0,
    listEscalationRules: async () => [],
    findEscalationRule: async () => null,
    fetchMetrics: async () => ({
      transferCount: 0,
      escalationReasons: {},
      escalationCount: 0,
      averageWaitTimeSeconds: 0,
      queuePerformance: [],
      aiResolutionRate: 0,
      humanResolutionRate: 0,
      agentUtilization: [],
    }),
  };
}

describe("HandoffCommandService integration", () => {
  const ctx = {
    userId: "agent-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: () => true,
  };

  const conversations: HandoffConversationPort = {
    assignConversation: async () => {},
    releaseConversation: async () => {},
    closeConversation: async () => {},
    updateMetadata: async () => {},
    getConversation: async () => ({
      id: "conv-1",
      companyId: "company-1",
      aiAssistantId: "ai-1",
      assignedUserId: null,
      customerId: "cust-1",
      state: "waiting_user",
      metadata: {},
      channelType: "whatsapp",
      priority: "normal",
    }),
  };

  const noop = {
    events: { publish: async () => {} } satisfies HandoffEventPublisherPort,
    notifications: { notify: async () => {} } satisfies HandoffNotificationPort,
    audit: { write: async () => {} } satisfies HandoffAuditPort,
    agents: {
      resolveAgentLabel: async (id: string) => `Agent ${id}`,
      loadAgentLabels: async (ids: string[]) => new Map(ids.map((id) => [id, `Agent ${id}`])),
    } satisfies HandoffAgentResolverPort,
    context: {
      buildContext: async () => ({
        summary: "Test summary",
        suggestedResolution: "",
        suggestedReply: "",
        payload: {},
        openTickets: [],
        appointments: [],
      }),
    } satisfies HandoffContextAssemblyPort,
  };

  it("assigns conversation to human agent", async () => {
    let assigned = false;
    const service = new HandoffCommandService({
      handoff: createMemoryRepo(),
      conversations: {
        ...conversations,
        assignConversation: async () => {
          assigned = true;
        },
      },
      ...noop,
    });

    const result = await service.assignConversation(ctx, {
      companyId: "company-1",
      conversationId: "conv-1",
      assigneeUserId: "agent-2",
    });

    assert.equal(result.ownership.ownerType, "human_agent");
    assert.equal(result.ownership.assignedUserId, "agent-2");
    assert.equal(assigned, true);
  });

  it("returns conversation to AI", async () => {
    let released = false;
    const repo = createMemoryRepo();
    await repo.upsertOwnership({
      companyId: "company-1",
      conversationId: "conv-1",
      ownerType: "human_agent",
      ownerId: "agent-1",
      ownerLabel: "Agent",
      lifecycleState: "ASSIGNED",
      assignedUserId: "agent-1",
      aiAssistantId: "ai-1",
    });

    const service = new HandoffCommandService({
      handoff: repo,
      conversations: {
        ...conversations,
        releaseConversation: async () => {
          released = true;
        },
      },
      ...noop,
    });

    const result = await service.returnConversationToAi(ctx, {
      companyId: "company-1",
      conversationId: "conv-1",
    });

    assert.equal(result.ownership.ownerType, "ai_employee");
    assert.equal(released, true);
  });
});
