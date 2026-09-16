import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAgentPresenceRealtimeRegistry } from "./agent-presence-realtime-registry";

describe("createAgentPresenceRealtimeRegistry", () => {
  it("prevents duplicate subscriptions for the same company", () => {
    let bindCount = 0;
    let unbindCount = 0;
    const registry = createAgentPresenceRealtimeRegistry({
      bind: () => {
        bindCount += 1;
        return () => {
          unbindCount += 1;
        };
      },
    });

    const releaseA = registry.retain("company-1", () => undefined);
    const releaseB = registry.retain("company-1", () => undefined);

    assert.equal(bindCount, 1);
    assert.equal(registry.refCount("company-1"), 2);
    assert.equal(registry.hasChannel("company-1"), true);

    releaseA();
    assert.equal(unbindCount, 0);
    assert.equal(registry.refCount("company-1"), 1);

    releaseB();
    assert.equal(unbindCount, 1);
    assert.equal(registry.refCount("company-1"), 0);
    assert.equal(registry.hasChannel("company-1"), false);
  });

  it("company change unsubscribes old channel and binds the new one", () => {
    const bound: string[] = [];
    const unbound: string[] = [];
    const registry = createAgentPresenceRealtimeRegistry({
      bind: (companyId) => {
        bound.push(companyId);
        return () => {
          unbound.push(companyId);
        };
      },
    });

    const releaseOld = registry.retain("company-old", () => undefined);
    releaseOld();
    const releaseNew = registry.retain("company-new", () => undefined);

    assert.deepEqual(bound, ["company-old", "company-new"]);
    assert.deepEqual(unbound, ["company-old"]);
    assert.equal(registry.hasChannel("company-old"), false);
    assert.equal(registry.hasChannel("company-new"), true);
    releaseNew();
  });

  it("logout/unmount cleans subscription via reset and release", () => {
    let unbindCount = 0;
    const registry = createAgentPresenceRealtimeRegistry({
      bind: () => () => {
        unbindCount += 1;
      },
    });

    const release = registry.retain("company-1", () => undefined);
    release();
    assert.equal(unbindCount, 1);

    registry.retain("company-2", () => undefined);
    registry.reset();
    assert.equal(unbindCount, 2);
    assert.equal(registry.hasChannel("company-2"), false);
  });

  it("forwards events to all active retain listeners (fan-out)", () => {
    const seenA: string[] = [];
    const seenB: string[] = [];
    let emit: ((payload: { eventType: string; new: unknown; old: unknown }) => void) | null =
      null;

    const registry = createAgentPresenceRealtimeRegistry({
      bind: (_companyId, onEvent) => {
        emit = onEvent;
        return () => {
          emit = null;
        };
      },
    });

    const releaseA = registry.retain("company-1", (payload) => {
      seenA.push(payload.eventType);
    });
    const releaseB = registry.retain("company-1", (payload) => {
      seenB.push(payload.eventType);
    });

    emit?.({ eventType: "UPDATE", new: { state: "away" }, old: { state: "online" } });
    assert.deepEqual(seenA, ["UPDATE"]);
    assert.deepEqual(seenB, ["UPDATE"]);

    releaseA();
    emit?.({ eventType: "INSERT", new: { state: "online" }, old: null });
    assert.deepEqual(seenA, ["UPDATE"]);
    assert.deepEqual(seenB, ["UPDATE", "INSERT"]);
    releaseB();
  });
});
