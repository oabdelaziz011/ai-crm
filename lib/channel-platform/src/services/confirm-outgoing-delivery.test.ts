import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { confirmOutgoingDeliveryWithRetry } from "../services/confirm-outgoing-delivery.js";

describe("confirmOutgoingDeliveryWithRetry", () => {
  it("succeeds on first attempt", async () => {
    let calls = 0;
    const result = await confirmOutgoingDeliveryWithRetry(
      async () => {
        calls += 1;
      },
      { messageId: "msg-1", status: "sent", externalMessageId: "wamid.1" },
      { delayMs: 1 },
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.attempts, 1);
    assert.equal(calls, 1);
  });

  it("retries and eventually succeeds without implying a provider resend", async () => {
    let calls = 0;
    const result = await confirmOutgoingDeliveryWithRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error("transient");
      },
      { messageId: "msg-1", status: "sent", externalMessageId: "wamid.1" },
      { maxAttempts: 3, delayMs: 1 },
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.attempts, 3);
    assert.equal(calls, 3);
  });

  it("returns failed after exhausting retries (idempotent caller can retry later)", async () => {
    let calls = 0;
    const result = await confirmOutgoingDeliveryWithRetry(
      async () => {
        calls += 1;
        throw new Error("rpc down");
      },
      { messageId: "msg-1", status: "sent", externalMessageId: "wamid.1" },
      { maxAttempts: 2, delayMs: 1 },
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.attempts, 2);
      assert.match(String((result.error as Error).message), /rpc down/);
    }
    assert.equal(calls, 2);
  });
});
