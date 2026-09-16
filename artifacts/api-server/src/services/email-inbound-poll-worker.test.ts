import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  __resetEmailInboundPollWorkerForTests,
  isEmailInboundPollWorkerEnabled,
  resolveEmailInboundPollExecuteAi,
  resolveEmailInboundPollIntervalMs,
  startEmailInboundPollWorker,
} from "./email-inbound-poll-worker.ts";

describe("email-inbound-poll-worker", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    __resetEmailInboundPollWorkerForTests();
    delete process.env.EMAIL_POLL_WORKER_ENABLED;
    delete process.env.EMAIL_POLL_WORKER_INTERVAL_MS;
    delete process.env.EMAIL_POLL_WORKER_EXECUTE_AI;
  });

  afterEach(async () => {
    __resetEmailInboundPollWorkerForTests();
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  it("defaults to enabled when env unset", () => {
    assert.equal(isEmailInboundPollWorkerEnabled({}), true);
  });

  it("disables when EMAIL_POLL_WORKER_ENABLED=false", () => {
    assert.equal(isEmailInboundPollWorkerEnabled({ EMAIL_POLL_WORKER_ENABLED: "false" }), false);
    assert.equal(isEmailInboundPollWorkerEnabled({ EMAIL_POLL_WORKER_ENABLED: "0" }), false);
  });

  it("clamps interval to minimum 15000ms", () => {
    assert.equal(resolveEmailInboundPollIntervalMs({ EMAIL_POLL_WORKER_INTERVAL_MS: "1000" }), 15_000);
    assert.equal(resolveEmailInboundPollIntervalMs({ EMAIL_POLL_WORKER_INTERVAL_MS: "60000" }), 60_000);
  });

  it("resolves AI execution flag (default OFF for email inbound)", () => {
    assert.equal(resolveEmailInboundPollExecuteAi({}), false);
    assert.equal(resolveEmailInboundPollExecuteAi({ EMAIL_POLL_WORKER_EXECUTE_AI: "true" }), true);
    assert.equal(resolveEmailInboundPollExecuteAi({ EMAIL_POLL_WORKER_EXECUTE_AI: "false" }), false);
  });

  it("does not start when disabled", () => {
    process.env.EMAIL_POLL_WORKER_ENABLED = "false";
    const handle = startEmailInboundPollWorker({
      getPlatform: () => {
        throw new Error("platform must not be loaded when disabled");
      },
    });
    assert.equal(handle, null);
  });

  it("starts exactly once (duplicate start reuses handle)", async () => {
    process.env.EMAIL_POLL_WORKER_INTERVAL_MS = "15000";
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    let pollCalls = 0;

    const handle1 = startEmailInboundPollWorker({
      setTimeoutFn: ((fn: () => void) => {
        const id = setTimeout(fn, 0);
        timers.push(id);
        return id;
      }) as typeof setTimeout,
      setIntervalFn: ((fn: () => void) => {
        const id = setInterval(fn, 60_000);
        timers.push(id);
        return id;
      }) as typeof setInterval,
      clearTimeoutFn: clearTimeout,
      clearIntervalFn: clearInterval,
      getPlatform: () => ({
        emailPollingWorker: {
          pollAllEnabledChannels: async () => {
            pollCalls += 1;
            return [{ companyChannelId: "ch-1", processed: 0 }];
          },
        },
      }),
      loggerInfo: () => undefined,
      loggerError: () => undefined,
    });

    const handle2 = startEmailInboundPollWorker({
      getPlatform: () => {
        throw new Error("second start must not create a new worker");
      },
    });

    assert.ok(handle1);
    assert.equal(handle1, handle2);
    await new Promise((r) => setTimeout(r, 30));
    assert.ok(pollCalls >= 1);
    await handle1!.stop();
    for (const t of timers) {
      clearTimeout(t);
      clearInterval(t);
    }
  });

  it("skips overlapping ticks while a slow poll is running", async () => {
    process.env.EMAIL_POLL_WORKER_INTERVAL_MS = "15000";
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = 0;
    let completed = 0;
    const events: string[] = [];

    const handle = startEmailInboundPollWorker({
      setTimeoutFn: ((fn: () => void) => setTimeout(fn, 0)) as typeof setTimeout,
      setIntervalFn: ((fn: () => void) => {
        // fire a second tick quickly while first is blocked
        setTimeout(fn, 5);
        return setInterval(() => undefined, 60_000);
      }) as typeof setInterval,
      clearTimeoutFn: clearTimeout,
      clearIntervalFn: clearInterval,
      getPlatform: () => ({
        emailPollingWorker: {
          pollAllEnabledChannels: async () => {
            started += 1;
            await gate;
            completed += 1;
            return [{ companyChannelId: "ch-1", processed: 1 }];
          },
        },
      }),
      loggerInfo: ((payload: { event?: string }) => {
        if (payload?.event) events.push(payload.event);
      }) as never,
      loggerError: () => undefined,
    });

    assert.ok(handle);
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(started, 1);
    assert.equal(handle!.isRunning(), true);
    assert.ok(events.includes("email.poll.worker.tick_skipped"));
    release();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(completed, 1);
    await handle!.stop();
  });

  it("passes executeAi=false into pollAllEnabledChannels", async () => {
    process.env.EMAIL_POLL_WORKER_EXECUTE_AI = "false";
    process.env.EMAIL_POLL_WORKER_INTERVAL_MS = "15000";
    let seenExecuteAi: boolean | undefined;

    const handle = startEmailInboundPollWorker({
      setTimeoutFn: ((fn: () => void) => setTimeout(fn, 0)) as typeof setTimeout,
      setIntervalFn: ((fn: () => void) => setInterval(fn, 60_000)) as typeof setInterval,
      clearTimeoutFn: clearTimeout,
      clearIntervalFn: clearInterval,
      getPlatform: () => ({
        emailPollingWorker: {
          pollAllEnabledChannels: async (input) => {
            seenExecuteAi = input?.executeAi;
            return [];
          },
        },
      }),
      loggerInfo: () => undefined,
      loggerError: () => undefined,
    });

    await new Promise((r) => setTimeout(r, 30));
    assert.equal(seenExecuteAi, false);
    await handle!.stop();
  });

  it("graceful stop clears timers and waits for active tick", async () => {
    process.env.EMAIL_POLL_WORKER_INTERVAL_MS = "15000";
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let completed = false;

    const handle = startEmailInboundPollWorker({
      setTimeoutFn: ((fn: () => void) => setTimeout(fn, 0)) as typeof setTimeout,
      setIntervalFn: ((fn: () => void) => setInterval(fn, 60_000)) as typeof setInterval,
      clearTimeoutFn: clearTimeout,
      clearIntervalFn: clearInterval,
      getPlatform: () => ({
        emailPollingWorker: {
          pollAllEnabledChannels: async () => {
            await gate;
            completed = true;
            return [];
          },
        },
      }),
      loggerInfo: () => undefined,
      loggerError: () => undefined,
    });

    await new Promise((r) => setTimeout(r, 20));
    const stopPromise = Promise.resolve(handle!.stop());
    assert.equal(completed, false);
    release();
    await stopPromise;
    assert.equal(completed, true);
    assert.equal(handle!.isStopped(), true);
  });
});
