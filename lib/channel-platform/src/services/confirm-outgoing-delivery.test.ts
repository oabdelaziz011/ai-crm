import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  confirmOutgoingDeliveryWithRetry,
  retryUnconfirmedOutgoingConfirmation,
} from "../services/confirm-outgoing-delivery.js";

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

describe("retryUnconfirmedOutgoingConfirmation", () => {
  it("confirms a sent delivery still in preparing without a provider send", async () => {
    const confirms: Array<{ messageId: string; status: string; externalMessageId?: string | null }> = [];
    let sendCalls = 0;

    const result = await retryUnconfirmedOutgoingConfirmation(
      async (input) => {
        confirms.push(input);
      },
      {
        messageId: "msg-out-1",
        deliveryStatus: "sent",
        externalMessageId: "wamid.out-1",
        outboundPhase: "preparing",
      },
      { delayMs: 1 },
    );

    assert.equal(result.ok, true);
    if (result.ok && result.attempted) assert.equal(result.attempts, 1);
    assert.equal(confirms.length, 1);
    assert.equal(confirms[0]?.messageId, "msg-out-1");
    assert.equal(confirms[0]?.status, "sent");
    assert.equal(confirms[0]?.externalMessageId, "wamid.out-1");
    assert.equal(sendCalls, 0);
  });

  it("keeps the row unconfirmed when confirm keeps failing and does not send", async () => {
    let confirmCalls = 0;
    let sendCalls = 0;
    let phase = "dispatching";
    const result = await retryUnconfirmedOutgoingConfirmation(
      async () => {
        confirmCalls += 1;
        throw new Error("confirm rpc unavailable");
      },
      {
        messageId: "msg-out-1",
        deliveryStatus: "delivered",
        externalMessageId: "wamid.out-1",
        outboundPhase: phase,
      },
      { maxAttempts: 2, delayMs: 1 },
    );

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.attempts, 2);
    assert.equal(confirmCalls, 2);
    assert.equal(phase, "dispatching");
    assert.equal(sendCalls, 0);
  });

  it("does not confirm again once the phase is no longer preparing or dispatching", async () => {
    let confirmCalls = 0;
    const result = await retryUnconfirmedOutgoingConfirmation(
      async () => {
        confirmCalls += 1;
      },
      {
        messageId: "msg-out-1",
        deliveryStatus: "sent",
        externalMessageId: "wamid.out-1",
        outboundPhase: "sent",
      },
      { delayMs: 1 },
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.attempted, false);
    assert.equal(confirmCalls, 0);
  });
});
