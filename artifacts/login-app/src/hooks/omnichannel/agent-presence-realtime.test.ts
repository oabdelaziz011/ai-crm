import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  agentPresenceRealtimeChannelName,
  mapAgentPresenceRealtimeRow,
  planAgentPresenceRealtimePatch,
  shouldInvalidateAssignmentTargets,
} from "./agent-presence-realtime";

const COMPANY_A = "11111111-1111-1111-1111-111111111111";
const COMPANY_B = "22222222-2222-2222-2222-222222222222";
const USER_1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "pres-1",
    company_id: COMPANY_A,
    user_id: USER_1,
    state: "online",
    viewing_conversation_id: null,
    last_heartbeat_at: "2026-09-07T12:00:00.000Z",
    last_seen_at: "2026-09-07T12:00:00.000Z",
    metadata: {},
    updated_at: "2026-09-07T12:00:00.000Z",
    ...overrides,
  };
}

describe("agentPresenceRealtimeChannelName", () => {
  it("initializes company-scoped channel name", () => {
    assert.equal(
      agentPresenceRealtimeChannelName(COMPANY_A),
      `omnichannel-agent-presence:${COMPANY_A}`,
    );
  });
});

describe("mapAgentPresenceRealtimeRow", () => {
  it("maps a valid presence row", () => {
    const mapped = mapAgentPresenceRealtimeRow(row({ state: "away" }));
    assert.ok(mapped);
    assert.equal(mapped.companyId, COMPANY_A);
    assert.equal(mapped.userId, USER_1);
    assert.equal(mapped.state, "away");
  });

  it("ignores malformed rows safely", () => {
    assert.equal(mapAgentPresenceRealtimeRow(null), null);
    assert.equal(mapAgentPresenceRealtimeRow({ company_id: COMPANY_A }), null);
    assert.equal(mapAgentPresenceRealtimeRow(row({ state: "not-a-state" })), null);
    assert.equal(mapAgentPresenceRealtimeRow(row({ user_id: "" })), null);
  });
});

describe("planAgentPresenceRealtimePatch", () => {
  it("UPDATE event updates the correct agent", () => {
    const patch = planAgentPresenceRealtimePatch({
      currentCompanyId: COMPANY_A,
      eventType: "UPDATE",
      oldRow: row({ state: "online" }),
      newRow: row({ state: "away", user_id: USER_1 }),
    });
    assert.equal(patch.type, "set");
    if (patch.type !== "set") return;
    assert.equal(patch.userId, USER_1);
    assert.equal(patch.presence.state, "away");
    assert.equal(patch.stateChanged, true);
    assert.equal(shouldInvalidateAssignmentTargets(patch), true);
  });

  it("INSERT event adds the correct agent", () => {
    const patch = planAgentPresenceRealtimePatch({
      currentCompanyId: COMPANY_A,
      eventType: "INSERT",
      oldRow: null,
      newRow: row({ user_id: USER_2, state: "busy" }),
    });
    assert.equal(patch.type, "set");
    if (patch.type !== "set") return;
    assert.equal(patch.userId, USER_2);
    assert.equal(patch.presence.state, "busy");
    assert.equal(patch.stateChanged, true);
  });

  it("DELETE event clears the correct agent", () => {
    const patch = planAgentPresenceRealtimePatch({
      currentCompanyId: COMPANY_A,
      eventType: "DELETE",
      oldRow: row({ user_id: USER_1, state: "online" }),
      newRow: null,
    });
    assert.equal(patch.type, "clear");
    if (patch.type !== "clear") return;
    assert.equal(patch.userId, USER_1);
    assert.equal(patch.stateChanged, true);
  });

  it("cross-company event is ignored", () => {
    const patch = planAgentPresenceRealtimePatch({
      currentCompanyId: COMPANY_A,
      eventType: "UPDATE",
      oldRow: row({ company_id: COMPANY_B, state: "online" }),
      newRow: row({ company_id: COMPANY_B, state: "away" }),
    });
    assert.deepEqual(patch, { type: "ignore", reason: "cross_company" });
    assert.equal(shouldInvalidateAssignmentTargets(patch), false);
  });

  it("malformed event is ignored safely", () => {
    const patch = planAgentPresenceRealtimePatch({
      currentCompanyId: COMPANY_A,
      eventType: "UPDATE",
      oldRow: null,
      newRow: { foo: "bar" },
    });
    assert.deepEqual(patch, { type: "ignore", reason: "malformed_row" });
  });

  it("heartbeat-only UPDATE does not mark stateChanged (no assignment refetch)", () => {
    const patch = planAgentPresenceRealtimePatch({
      currentCompanyId: COMPANY_A,
      eventType: "UPDATE",
      oldRow: row({
        state: "online",
        last_heartbeat_at: "2026-09-07T12:00:00.000Z",
      }),
      newRow: row({
        state: "online",
        last_heartbeat_at: "2026-09-07T12:00:30.000Z",
      }),
    });
    assert.equal(patch.type, "set");
    if (patch.type !== "set") return;
    assert.equal(patch.stateChanged, false);
    assert.equal(shouldInvalidateAssignmentTargets(patch), false);
  });

  it("self-update with same state is a set patch without assignment invalidation", () => {
    const patch = planAgentPresenceRealtimePatch({
      currentCompanyId: COMPANY_A,
      eventType: "UPDATE",
      oldRow: row({ state: "busy" }),
      newRow: row({ state: "busy", updated_at: "2026-09-07T12:01:00.000Z" }),
    });
    assert.equal(patch.type, "set");
    if (patch.type !== "set") return;
    assert.equal(patch.stateChanged, false);
  });
});

describe("realtime side-effect boundaries", () => {
  it("planner never implies heartbeat write, assignment, or reply permission changes", () => {
    const patch = planAgentPresenceRealtimePatch({
      currentCompanyId: COMPANY_A,
      eventType: "UPDATE",
      oldRow: row({ state: "online" }),
      newRow: row({ state: "offline" }),
    });
    // Cache-only vocabulary — no command fields.
    assert.ok(patch.type === "set" || patch.type === "clear" || patch.type === "ignore");
    assert.equal("triggerHeartbeat" in patch, false);
    assert.equal("assignConversation" in patch, false);
    assert.equal("replyPermission" in patch, false);
  });
});
