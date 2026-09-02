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
import type { HandoffQueueRecord, OwnershipRecord, QueueMemberRecord } from "../types/handoff-types.js";

const queue: HandoffQueueRecord = {
  id: "queue-support",
  companyId: "company-1",
  name: "Customer Support",
  slug: "support",
  description: "",
  routingStrategy: "least_busy",
  departmentId: null,
  maxQueueSize: 100,
  overflowQueueId: null,
  businessHours: {},
  skills: [],
  languages: [],
  priorityWeight: 0,
  isActive: true,
  metadata: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function createRepo(overrides: Partial<HandoffRepository> = {}): HandoffRepository {
  const ownership = new Map<string, OwnershipRecord>();
  const members: QueueMemberRecord[] = [
    {
      id: "member-1",
      queueId: queue.id,
      companyId: queue.companyId,
      userId: "agent-busy",
      skills: [],
      languages: [],
      isActive: true,
      lastAssignedAt: null,
      activeConversationCount: 5,
    },
    {
      id: "member-2",
      queueId: queue.id,
      companyId: queue.companyId,
      userId: "agent-free",
      skills: [],
      languages: [],
      isActive: true,
      lastAssignedAt: null,
      activeConversationCount: 1,
    },
  ];

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
      companyId: "company-1",
      conversationId: "conv-1",
      requestType: "escalation",
      status: input.status,
      fromOwnerType: "ai_employee",
      fromOwnerId: "ai-1",
      toOwnerType: "queue",
      toOwnerId: queue.id,
      toQueueId: queue.id,
      reason: "queued",
      escalationReasonCode: "customer_requested",
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
    listQueues: async () => [queue],
    getQueue: async (_companyId, queueId) => (queueId === queue.id ? queue : null),
    countQueueWaiting: async () => 1,
    listQueueMembers: async () => members,
    incrementMemberAssignment: async () => {},
    syncMemberActiveConversationCount: async () => {},
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
    listPresence: async (_companyId, states) =>
      states?.includes("online")
        ? [
            {
              id: "pres-busy",
              companyId: "company-1",
              userId: "agent-busy",
              state: "online",
              viewingConversationId: null,
              lastHeartbeatAt: new Date().toISOString(),
              lastSeenAt: new Date().toISOString(),
              metadata: {},
              updatedAt: new Date().toISOString(),
            },
            {
              id: "pres-free",
              companyId: "company-1",
              userId: "agent-free",
              state: "online",
              viewingConversationId: null,
              lastHeartbeatAt: new Date().toISOString(),
              lastSeenAt: new Date().toISOString(),
              metadata: {},
              updatedAt: new Date().toISOString(),
            },
          ]
        : [],
    expireStalePresence: async () => 0,
    listEscalationRules: async () => [
      {
        id: "rule-1",
        companyId: "company-1",
        name: "Customer requested",
        triggerCode: "customer_requested",
        targetQueueId: queue.id,
        targetLevel: "supervisor",
        priorityBoost: "normal",
        conditions: {},
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
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
    ...overrides,
  };
}

describe("requestCustomerHandoff", () => {
  const ctx = {
    userId: "system-agent",
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

  const notifications = {
    calls: [] as string[],
    port: {
      notify: async (input: { kind: string }) => {
        notifications.calls.push(input.kind);
      },
    } satisfies HandoffNotificationPort,
  };

  const noop = {
    events: { publish: async () => {} } satisfies HandoffEventPublisherPort,
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

  it("assigns to the least busy online eligible agent", async () => {
    let assignedUserId: string | null = null;
    let incremented = false;
    const service = new HandoffCommandService({
      handoff: createRepo({
        incrementMemberAssignment: async () => {
          incremented = true;
        },
      }),
      conversations: {
        ...conversations,
        assignConversation: async (input) => {
          assignedUserId = input.assignedUserId;
        },
      },
      notifications: notifications.port,
      ...noop,
    });

    const result = await service.requestCustomerHandoff(ctx, {
      companyId: "company-1",
      conversationId: "conv-1",
      triggerCode: "customer_requested",
      reason: "Customer requested human support",
    });

    assert.equal(result.assigned, true);
    assert.equal(result.assigneeUserId, "agent-free");
    assert.equal(assignedUserId, "agent-free");
    assert.equal(incremented, true);
    assert.ok(notifications.calls.includes("assignment"));
  });

  it("still assigns when owner_changed event publish fails", async () => {
    let assignedUserId: string | null = null;
    const service = new HandoffCommandService({
      handoff: createRepo(),
      conversations: {
        ...conversations,
        assignConversation: async (input) => {
          assignedUserId = input.assignedUserId;
        },
      },
      notifications: notifications.port,
      ...noop,
      events: {
        publish: async () => {
          throw new Error("permission denied for function current_company_id");
        },
      },
    });

    const result = await service.requestCustomerHandoff(ctx, {
      companyId: "company-1",
      conversationId: "conv-event-fail",
      triggerCode: "customer_requested",
    });

    assert.equal(result.assigned, true);
    assert.equal(result.assigneeUserId, "agent-free");
    assert.equal(assignedUserId, "agent-free");
  });

  it("queues when no online agents are available", async () => {
    const service = new HandoffCommandService({
      handoff: createRepo({
        listPresence: async () => [],
      }),
      conversations,
      notifications: notifications.port,
      ...noop,
    });

    const result = await service.requestCustomerHandoff(ctx, {
      companyId: "company-1",
      conversationId: "conv-2",
      triggerCode: "customer_requested",
    });

    assert.equal(result.assigned, false);
    assert.equal(result.queued, true);
    assert.equal(result.ownership.ownerType, "queue");
    assert.ok(notifications.calls.includes("escalation"));
  });

  it("is idempotent when conversation is already human owned", async () => {
    const repo = createRepo();
    await repo.upsertOwnership({
      companyId: "company-1",
      conversationId: "conv-owned",
      ownerType: "human_agent",
      ownerId: "agent-busy",
      ownerLabel: "Agent",
      lifecycleState: "ASSIGNED",
      assignedUserId: "agent-busy",
      aiAssistantId: "ai-1",
    });

    let assigned = false;
    const service = new HandoffCommandService({
      handoff: repo,
      conversations: {
        ...conversations,
        assignConversation: async () => {
          assigned = true;
        },
      },
      notifications: notifications.port,
      ...noop,
    });

    const result = await service.requestCustomerHandoff(ctx, {
      companyId: "company-1",
      conversationId: "conv-owned",
    });

    assert.equal(result.idempotent, true);
    assert.equal(assigned, false);
  });
});
