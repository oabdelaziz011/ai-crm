import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectQueueAgent, estimateWaitTimeSeconds, isWithinBusinessHours } from "../services/queue-routing-engine.js";
import { resolveEscalationRule, applyPriorityBoost } from "../services/escalation-engine.js";
import { shouldExpirePresence } from "../services/presence-engine.js";
import type { HandoffQueueRecord, QueueMemberRecord } from "../types/handoff-types.js";

describe("queue routing engine", () => {
  const queue: HandoffQueueRecord = {
    id: "queue-1",
    companyId: "company-1",
    name: "Support",
    slug: "support",
    description: "",
    routingStrategy: "round_robin",
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

  const members: QueueMemberRecord[] = [
    {
      id: "m1",
      queueId: "queue-1",
      companyId: "company-1",
      userId: "agent-a",
      skills: ["billing"],
      languages: ["en"],
      isActive: true,
      lastAssignedAt: "2026-01-01T00:00:00.000Z",
      activeConversationCount: 2,
    },
    {
      id: "m2",
      queueId: "queue-1",
      companyId: "company-1",
      userId: "agent-b",
      skills: ["billing", "technical"],
      languages: ["en", "ar"],
      isActive: true,
      lastAssignedAt: "2026-01-02T00:00:00.000Z",
      activeConversationCount: 0,
    },
  ];

  it("selects round robin agent with oldest assignment", () => {
    const agent = selectQueueAgent({
      queue,
      members,
      presenceByUserId: new Map([
        ["agent-a", { userId: "agent-a", state: "online" } as never],
        ["agent-b", { userId: "agent-b", state: "online" } as never],
      ]),
    });
    assert.equal(agent?.userId, "agent-a");
  });

  it("selects least busy agent", () => {
    const agent = selectQueueAgent({
      queue: { ...queue, routingStrategy: "least_busy" },
      members,
      presenceByUserId: new Map([
        ["agent-a", { userId: "agent-a", state: "online" } as never],
        ["agent-b", { userId: "agent-b", state: "online" } as never],
      ]),
    });
    assert.equal(agent?.userId, "agent-b");
  });

  it("estimates wait time based on queue size and agents", () => {
    assert.equal(estimateWaitTimeSeconds(0, 2), 0);
    assert.equal(estimateWaitTimeSeconds(4, 2), 120);
  });

  it("allows routing when business hours are empty", () => {
    assert.equal(isWithinBusinessHours({}), true);
  });
});

describe("escalation engine", () => {
  it("resolves direct trigger rule", () => {
    const rule = resolveEscalationRule({
      triggerCode: "billing",
      rules: [
        {
          id: "r1",
          companyId: "c1",
          name: "Billing",
          triggerCode: "billing",
          targetQueueId: "q1",
          targetLevel: "supervisor",
          priorityBoost: "high",
          conditions: {},
          isActive: true,
        },
      ],
    });
    assert.equal(rule?.targetQueueId, "q1");
  });

  it("boosts priority", () => {
    assert.equal(applyPriorityBoost("normal", "high"), "high");
    assert.equal(applyPriorityBoost("urgent", "high"), "urgent");
  });
});

describe("presence engine", () => {
  it("expires stale heartbeat", () => {
    const stale = new Date(Date.now() - 300_000).toISOString();
    assert.equal(shouldExpirePresence(stale), true);
    assert.equal(shouldExpirePresence(new Date().toISOString()), false);
  });
});
