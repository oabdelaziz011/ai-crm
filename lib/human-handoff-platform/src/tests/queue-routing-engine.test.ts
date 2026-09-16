import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectQueueAgent } from "../services/queue-routing-engine.js";
import type { AgentPresenceRecord, HandoffQueueRecord, QueueMemberRecord } from "../types/handoff-types.js";

const queue: HandoffQueueRecord = {
  id: "queue-1",
  companyId: "company-1",
  name: "Support",
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

const FRESH_HB = new Date().toISOString();

function member(input: Partial<QueueMemberRecord> & Pick<QueueMemberRecord, "userId">): QueueMemberRecord {
  return {
    id: `member-${input.userId}`,
    queueId: queue.id,
    companyId: queue.companyId,
    userId: input.userId,
    skills: [],
    languages: [],
    isActive: input.isActive ?? true,
    lastAssignedAt: input.lastAssignedAt ?? null,
    activeConversationCount: input.activeConversationCount ?? 0,
  };
}

function online(userId: string): AgentPresenceRecord {
  return {
    id: `pres-${userId}`,
    companyId: "company-1",
    userId,
    state: "online",
    viewingConversationId: null,
    lastHeartbeatAt: FRESH_HB,
    lastSeenAt: FRESH_HB,
    metadata: {},
    updatedAt: FRESH_HB,
  };
}

describe("selectQueueAgent least_busy", () => {
  it("selects online agent with lowest activeConversationCount", () => {
    const selected = selectQueueAgent({
      queue,
      members: [
        member({ userId: "agent-a", activeConversationCount: 2 }),
        member({ userId: "agent-b", activeConversationCount: 5 }),
        member({ userId: "agent-c", activeConversationCount: 1 }),
      ],
      presenceByUserId: new Map([
        ["agent-a", online("agent-a")],
        ["agent-b", online("agent-b")],
        ["agent-c", online("agent-c")],
      ]),
    });

    assert.equal(selected?.userId, "agent-c");
  });

  it("ignores offline and inactive members", () => {
    const selected = selectQueueAgent({
      queue,
      members: [
        member({ userId: "offline-agent", activeConversationCount: 0 }),
        member({ userId: "inactive-agent", activeConversationCount: 0, isActive: false }),
        member({ userId: "online-agent", activeConversationCount: 3 }),
      ],
      presenceByUserId: new Map([
        [
          "offline-agent",
          {
            ...online("offline-agent"),
            state: "offline",
          },
        ],
        ["online-agent", online("online-agent")],
      ]),
    });

    assert.equal(selected?.userId, "online-agent");
  });

  it("breaks ties deterministically by lastAssignedAt then userId", () => {
    const selected = selectQueueAgent({
      queue,
      members: [
        member({ userId: "agent-z", activeConversationCount: 1, lastAssignedAt: "2026-01-01T00:00:00.000Z" }),
        member({ userId: "agent-a", activeConversationCount: 1, lastAssignedAt: "2026-01-01T00:00:00.000Z" }),
        member({ userId: "agent-m", activeConversationCount: 1, lastAssignedAt: "2025-12-31T00:00:00.000Z" }),
      ],
      presenceByUserId: new Map([
        ["agent-z", online("agent-z")],
        ["agent-a", online("agent-a")],
        ["agent-m", online("agent-m")],
      ]),
    });

    assert.equal(selected?.userId, "agent-m");
  });

  it("excludes online agents with stale heartbeat", () => {
    const staleHb = new Date(Date.now() - 300_000).toISOString();
    const selected = selectQueueAgent({
      queue,
      members: [member({ userId: "stale-online", activeConversationCount: 0 })],
      presenceByUserId: new Map([
        [
          "stale-online",
          {
            ...online("stale-online"),
            lastHeartbeatAt: staleHb,
          },
        ],
      ]),
    });
    assert.equal(selected, null);
  });
});
