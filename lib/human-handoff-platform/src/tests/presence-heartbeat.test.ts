import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_PRESENCE_TIMEOUT_MS } from "../constants.js";
import {
  PRESENCE_FRESHNESS_POLICY,
  heartbeatAgeMs,
  isAgentAvailableForAssignment,
  isAgentEffectivelyAvailableForAssignment,
  isPresenceHeartbeatFresh,
  shouldExpirePresence,
} from "../services/presence-engine.js";
import { countEffectivelyAvailableAgents, selectQueueAgent } from "../services/queue-routing-engine.js";
import type {
  AgentPresenceRecord,
  HandoffQueueRecord,
  PresenceState,
  QueueMemberRecord,
} from "../types/handoff-types.js";

const NOW = Date.parse("2026-09-07T12:00:00.000Z");
const FRESH = new Date(NOW - 30_000).toISOString();
const STALE = new Date(NOW - DEFAULT_PRESENCE_TIMEOUT_MS - 1_000).toISOString();

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
  createdAt: new Date(NOW).toISOString(),
  updatedAt: new Date(NOW).toISOString(),
};

function member(userId: string, overrides: Partial<QueueMemberRecord> = {}): QueueMemberRecord {
  return {
    id: `member-${userId}`,
    queueId: queue.id,
    companyId: queue.companyId,
    userId,
    skills: [],
    languages: [],
    isActive: true,
    lastAssignedAt: null,
    activeConversationCount: 0,
    ...overrides,
  };
}

function presence(
  userId: string,
  state: PresenceState,
  lastHeartbeatAt: string | null,
): AgentPresenceRecord {
  return {
    id: `pres-${userId}`,
    companyId: "company-1",
    userId,
    state,
    viewingConversationId: null,
    lastHeartbeatAt,
    lastSeenAt: lastHeartbeatAt,
    metadata: {},
    updatedAt: new Date(NOW).toISOString(),
  };
}

describe("PRESENCE_FRESHNESS_POLICY", () => {
  it("centralizes heartbeat interval and stale threshold", () => {
    assert.equal(PRESENCE_FRESHNESS_POLICY.heartbeatIntervalMs, 30_000);
    assert.equal(PRESENCE_FRESHNESS_POLICY.staleThresholdMs, 120_000);
    assert.deepEqual([...PRESENCE_FRESHNESS_POLICY.autoNormalizeStates], ["online"]);
  });
});

describe("effective availability", () => {
  it("fresh online agent is eligible", () => {
    assert.equal(
      isAgentEffectivelyAvailableForAssignment(presence("a", "online", FRESH), { nowMs: NOW }),
      true,
    );
  });

  it("stale online agent is NOT eligible", () => {
    assert.equal(
      isAgentEffectivelyAvailableForAssignment(presence("a", "online", STALE), { nowMs: NOW }),
      false,
    );
  });

  it("missing heartbeat is treated as stale", () => {
    assert.equal(isPresenceHeartbeatFresh(null, { nowMs: NOW }), false);
    assert.equal(shouldExpirePresence(null, NOW), true);
  });

  for (const state of ["busy", "away", "offline", "break", "dnd"] as const) {
    it(`${state} agent is excluded regardless of heartbeat`, () => {
      assert.equal(isAgentAvailableForAssignment(state), false);
      assert.equal(
        isAgentEffectivelyAvailableForAssignment(presence("a", state, FRESH), { nowMs: NOW }),
        false,
      );
    });
  }

  it("fresh heartbeat restores online eligibility", () => {
    assert.equal(
      isAgentEffectivelyAvailableForAssignment(presence("a", "online", STALE), { nowMs: NOW }),
      false,
    );
    assert.equal(
      isAgentEffectivelyAvailableForAssignment(presence("a", "online", FRESH), { nowMs: NOW }),
      true,
    );
  });

  it("reports heartbeat age for diagnostics", () => {
    assert.equal(heartbeatAgeMs(FRESH, NOW), 30_000);
    assert.equal(heartbeatAgeMs(null, NOW), null);
  });
});

describe("selectQueueAgent heartbeat freshness", () => {
  it("selects fresh online and excludes stale online", () => {
    const selected = selectQueueAgent({
      queue,
      members: [member("stale"), member("fresh")],
      presenceByUserId: new Map([
        ["stale", presence("stale", "online", STALE)],
        ["fresh", presence("fresh", "online", FRESH)],
      ]),
      nowMs: NOW,
    });
    assert.equal(selected?.userId, "fresh");
  });

  it("excludes busy/away/offline/break/dnd even with fresh heartbeat", () => {
    for (const state of ["busy", "away", "offline", "break", "dnd"] as const) {
      const selected = selectQueueAgent({
        queue,
        members: [member("agent")],
        presenceByUserId: new Map([["agent", presence("agent", state, FRESH)]]),
        nowMs: NOW,
      });
      assert.equal(selected, null, `expected ${state} excluded`);
    }
  });

  it("counts only effectively available agents", () => {
    const count = countEffectivelyAvailableAgents(
      [member("fresh"), member("stale"), member("busy")],
      [
        presence("fresh", "online", FRESH),
        presence("stale", "online", STALE),
        presence("busy", "busy", FRESH),
      ],
      { nowMs: NOW },
    );
    assert.equal(count, 1);
  });
});
