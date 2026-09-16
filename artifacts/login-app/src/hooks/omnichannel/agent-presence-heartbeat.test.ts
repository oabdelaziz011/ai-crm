import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPresenceHeartbeatController } from "./agent-presence-heartbeat";

describe("createPresenceHeartbeatController", () => {
  it("prevents duplicate timers when start is called twice", () => {
    const intervals: Array<ReturnType<typeof setInterval>> = [];
    let nextId = 1;
    const controller = createPresenceHeartbeatController({
      intervalMs: 1000,
      isVisible: () => true,
      onHeartbeat: () => {},
      setIntervalFn: (handler, ms) => {
        const id = nextId++ as unknown as ReturnType<typeof setInterval>;
        intervals.push(id);
        void handler;
        void ms;
        return id;
      },
      clearIntervalFn: (id) => {
        const idx = intervals.indexOf(id);
        if (idx >= 0) intervals.splice(idx, 1);
      },
    });

    controller.start();
    controller.start();
    assert.equal(intervals.length, 1);
    assert.equal(controller.isRunning(), true);
    controller.stop();
    assert.equal(intervals.length, 0);
    assert.equal(controller.isRunning(), false);
  });

  it("hidden tab does not immediately force offline (only pauses timer)", async () => {
    let visible = true;
    let beats = 0;
    const intervals: Array<ReturnType<typeof setInterval>> = [];
    let nextId = 1;

    const controller = createPresenceHeartbeatController({
      intervalMs: 1000,
      isVisible: () => visible,
      onHeartbeat: () => {
        beats += 1;
      },
      setIntervalFn: (handler, _ms) => {
        const id = nextId++ as unknown as ReturnType<typeof setInterval>;
        intervals.push(id);
        void handler;
        return id;
      },
      clearIntervalFn: (id) => {
        const idx = intervals.indexOf(id);
        if (idx >= 0) intervals.splice(idx, 1);
      },
    });

    controller.start();
    await Promise.resolve();
    assert.equal(beats, 1);
    assert.equal(controller.isRunning(), true);

    visible = false;
    controller.onVisibilityChange();
    assert.equal(controller.isRunning(), false);
    assert.equal(beats, 1); // no offline mutation — just stopped interval
  });

  it("visible tab resumes heartbeat promptly", async () => {
    let visible = false;
    let beats = 0;
    const intervals: Array<ReturnType<typeof setInterval>> = [];
    let nextId = 1;

    const controller = createPresenceHeartbeatController({
      intervalMs: 1000,
      isVisible: () => visible,
      onHeartbeat: () => {
        beats += 1;
      },
      setIntervalFn: (_handler, _ms) => {
        const id = nextId++ as unknown as ReturnType<typeof setInterval>;
        intervals.push(id);
        return id;
      },
      clearIntervalFn: (id) => {
        const idx = intervals.indexOf(id);
        if (idx >= 0) intervals.splice(idx, 1);
      },
    });

    controller.start();
    await Promise.resolve();
    assert.equal(beats, 0);

    visible = true;
    controller.onVisibilityChange();
    await Promise.resolve();
    assert.equal(beats, 1);
    assert.equal(controller.isRunning(), true);
    controller.stop();
  });

  it("logout/stop does not leave a running heartbeat timer", () => {
    const intervals: Array<ReturnType<typeof setInterval>> = [];
    let nextId = 1;
    const controller = createPresenceHeartbeatController({
      intervalMs: 1000,
      isVisible: () => true,
      onHeartbeat: () => {},
      setIntervalFn: (_handler, _ms) => {
        const id = nextId++ as unknown as ReturnType<typeof setInterval>;
        intervals.push(id);
        return id;
      },
      clearIntervalFn: (id) => {
        const idx = intervals.indexOf(id);
        if (idx >= 0) intervals.splice(idx, 1);
      },
    });

    controller.start();
    controller.stop();
    assert.equal(controller.isStopped(), true);
    assert.equal(controller.isRunning(), false);
    assert.equal(intervals.length, 0);

    controller.start(); // ignored after stop
    assert.equal(controller.isRunning(), false);
  });
});
