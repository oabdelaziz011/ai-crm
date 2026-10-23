import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  __resetSalesFollowUpWorkerForTests,
  isSalesFollowUpProviderSendAllowed,
  isSalesFollowUpWorkerEnabled,
  resolveSalesFollowUpWorkerIntervalMs,
  resolveSalesFollowUpWorkerLimit,
  startSalesFollowUpWorker,
} from "./sales-follow-up-worker.js";

describe("sales-follow-up-worker env gates", () => {
  it("stays disabled and send-blocked by default", () => {
    assert.equal(isSalesFollowUpWorkerEnabled({}), false);
    assert.equal(isSalesFollowUpProviderSendAllowed({}), false);
    assert.equal(resolveSalesFollowUpWorkerIntervalMs({}), 60_000);
    assert.equal(resolveSalesFollowUpWorkerLimit({ SALES_FOLLOW_UP_WORKER_LIMIT: "200" }), 100);
  });

  it("starts only when explicitly enabled and skips overlapping ticks", async () => {
    __resetSalesFollowUpWorkerForTests();
    process.env.SALES_FOLLOW_UP_WORKER_ENABLED = "true";
    process.env.SALES_FOLLOW_UP_WORKER_ALLOW_SEND = "false";
    let ticks = 0;
    const handle = startSalesFollowUpWorker({
      getClient: async () => {
        ticks += 1;
        throw new Error("tick probe");
      },
      setTimeoutFn: ((fn: () => void) => {
        fn();
        return 1 as unknown as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout,
      setIntervalFn: ((fn: () => void) => {
        return setInterval(() => undefined, 60_000);
      }) as typeof setInterval,
      clearTimeoutFn: (() => undefined) as typeof clearTimeout,
      clearIntervalFn: (() => undefined) as typeof clearInterval,
      loggerInfo: () => undefined,
      loggerError: () => undefined,
    });
    assert.ok(handle);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(ticks >= 1);
    await handle!.stop();
    __resetSalesFollowUpWorkerForTests();
    delete process.env.SALES_FOLLOW_UP_WORKER_ENABLED;
    delete process.env.SALES_FOLLOW_UP_WORKER_ALLOW_SEND;
  });
});
