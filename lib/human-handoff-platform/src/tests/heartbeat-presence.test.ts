import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HandoffCommandService } from "../services/handoff-command-service.js";
import { HandoffPermissionDeniedError } from "../errors.js";
import type { HandoffRepository } from "../repositories/handoff-repository-port.js";
import type {
  HandoffAgentResolverPort,
  HandoffAuditPort,
  HandoffContextAssemblyPort,
  HandoffConversationPort,
  HandoffEventPublisherPort,
  HandoffNotificationPort,
} from "../ports/handoff-platform-ports.js";
import type { AgentPresenceRecord, OwnershipRecord } from "../types/handoff-types.js";

function createPresenceRepo(): HandoffRepository & {
  presenceStore: Map<string, AgentPresenceRecord>;
  upsertCalls: AgentPresenceRecord[];
} {
  const presenceStore = new Map<string, AgentPresenceRecord>();
  const upsertCalls: AgentPresenceRecord[] = [];
  const key = (companyId: string, userId: string) => `${companyId}:${userId}`;

  return {
    presenceStore,
    upsertCalls,
    getOwnership: async () => null,
    upsertOwnership: async (input) =>
      ({
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
        pausedAt: null,
        pausedReason: null,
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }) satisfies OwnershipRecord,
    appendOwnershipHistory: async () => ({
      id: "hist-1",
      companyId: "company-1",
      conversationId: "conv-1",
      previousOwnerType: null,
      previousOwnerId: null,
      newOwnerType: "human_agent",
      newOwnerId: "agent-1",
      transitionAction: "assign",
      transitionReason: null,
      actorUserId: "agent-1",
      contextSnapshotId: null,
      createdAt: new Date().toISOString(),
    }),
    listOwnershipHistory: async () => [],
    createRequest: async () => {
      throw new Error("not used");
    },
    updateRequestStatus: async () => {
      throw new Error("not used");
    },
    getRequest: async () => null,
    getPendingRequest: async () => null,
    listPendingRequests: async () => [],
    createContextSnapshot: async () => {
      throw new Error("not used");
    },
    getLatestContextSnapshot: async () => null,
    listQueues: async () => [],
    getQueue: async () => null,
    countQueueWaiting: async () => 0,
    listQueueMembers: async () => [],
    incrementMemberAssignment: async () => {},
    syncMemberActiveConversationCount: async () => {},
    upsertPresence: async (input) => {
      const record: AgentPresenceRecord = {
        id: `pres-${input.userId}`,
        companyId: input.companyId,
        userId: input.userId,
        state: input.state,
        viewingConversationId: input.viewingConversationId ?? null,
        lastHeartbeatAt: input.lastHeartbeatAt ?? new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        metadata: {},
        updatedAt: new Date().toISOString(),
      };
      presenceStore.set(key(input.companyId, input.userId), record);
      upsertCalls.push(record);
      return record;
    },
    getPresence: async (companyId, userId) => presenceStore.get(key(companyId, userId)) ?? null,
    listPresence: async () => [...presenceStore.values()],
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
      summary: "",
      suggestedResolution: "",
      suggestedReply: "",
      payload: {},
      openTickets: [],
      appointments: [],
    }),
  } satisfies HandoffContextAssemblyPort,
};

describe("heartbeatPresence", () => {
  it("preserves current state and refreshes heartbeat (idempotent)", async () => {
    const repo = createPresenceRepo();
    await repo.upsertPresence({
      companyId: "company-1",
      userId: "agent-1",
      state: "busy",
      viewingConversationId: null,
      lastHeartbeatAt: "2026-01-01T00:00:00.000Z",
    });

    const service = new HandoffCommandService({
      handoff: repo,
      conversations,
      ...noop,
    });

    const ctx = {
      userId: "agent-1",
      companyId: "company-1",
      isSuperAdmin: false,
      hasPermission: () => true,
    };

    const first = await service.heartbeatPresence(ctx, { companyId: "company-1" });
    const second = await service.heartbeatPresence(ctx, { companyId: "company-1" });

    assert.equal(first.presence.state, "busy");
    assert.equal(second.presence.state, "busy");
    assert.ok(first.presence.lastHeartbeatAt);
    assert.ok(second.presence.lastHeartbeatAt);
    assert.equal(repo.upsertCalls.length, 3); // seed + 2 heartbeats
  });

  it("does not promote offline to online on heartbeat", async () => {
    const repo = createPresenceRepo();
    await repo.upsertPresence({
      companyId: "company-1",
      userId: "agent-1",
      state: "offline",
      viewingConversationId: null,
      lastHeartbeatAt: "2026-01-01T00:00:00.000Z",
    });

    const service = new HandoffCommandService({
      handoff: repo,
      conversations,
      ...noop,
    });

    const result = await service.heartbeatPresence(
      {
        userId: "agent-1",
        companyId: "company-1",
        isSuperAdmin: false,
        hasPermission: () => true,
      },
      { companyId: "company-1" },
    );

    assert.equal(result.presence.state, "offline");
  });

  it("rejects cross-company heartbeat", async () => {
    const service = new HandoffCommandService({
      handoff: createPresenceRepo(),
      conversations,
      ...noop,
    });

    await assert.rejects(
      () =>
        service.heartbeatPresence(
          {
            userId: "agent-1",
            companyId: "company-a",
            isSuperAdmin: false,
            hasPermission: () => true,
          },
          { companyId: "company-b" },
        ),
      HandoffPermissionDeniedError,
    );
  });

  it("heartbeats only the authenticated actor (cannot target another user)", async () => {
    const repo = createPresenceRepo();
    await repo.upsertPresence({
      companyId: "company-1",
      userId: "agent-other",
      state: "online",
      viewingConversationId: null,
      lastHeartbeatAt: "2026-01-01T00:00:00.000Z",
    });

    const service = new HandoffCommandService({
      handoff: repo,
      conversations,
      ...noop,
    });

    await service.heartbeatPresence(
      {
        userId: "agent-1",
        companyId: "company-1",
        isSuperAdmin: false,
        hasPermission: () => true,
      },
      { companyId: "company-1" },
    );

    const other = await repo.getPresence("company-1", "agent-other");
    assert.equal(other?.lastHeartbeatAt, "2026-01-01T00:00:00.000Z");
    const self = await repo.getPresence("company-1", "agent-1");
    assert.ok(self?.lastHeartbeatAt);
    assert.notEqual(self?.lastHeartbeatAt, "2026-01-01T00:00:00.000Z");
  });

  it("manual assign ignores presence (busy assignee still allowed)", async () => {
    const repo = createPresenceRepo();
    await repo.upsertPresence({
      companyId: "company-1",
      userId: "agent-busy",
      state: "busy",
      viewingConversationId: null,
      lastHeartbeatAt: new Date().toISOString(),
    });

    const service = new HandoffCommandService({
      handoff: repo,
      conversations,
      ...noop,
    });

    const result = await service.assignConversation(
      {
        userId: "manager-1",
        companyId: "company-1",
        isSuperAdmin: false,
        hasPermission: () => true,
      },
      {
        companyId: "company-1",
        conversationId: "conv-manual",
        assigneeUserId: "agent-busy",
      },
    );

    assert.equal(result.ownership.assignedUserId, "agent-busy");
  });
});
