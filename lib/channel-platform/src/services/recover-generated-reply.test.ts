import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recoverGeneratedReply } from "./recover-generated-reply.js";

describe("recoverGeneratedReply", () => {
  it("confirms a provider-accepted delivery and does not send when confirm fails", async () => {
    let confirmCalls = 0;
    let sendCalls = 0;
    let phase = "preparing";
    const sendOutbound = () => {
      sendCalls += 1;
    };

    const result = await recoverGeneratedReply(
      {
        replyText: "رد جاهز",
        outboundPhase: phase,
        deliveryStatus: "sent",
        hasNewerInbound: false,
        messageId: "msg-out-1",
        externalMessageId: "wamid.out-1",
      },
      async () => {
        confirmCalls += 1;
        throw new Error("confirm rpc unavailable");
      },
    );

    assert.equal(result.action, "confirm_only");
    if (result.action === "confirm_only") {
      assert.equal(result.confirmed, false);
      assert.equal(result.reason, "confirmation_failed");
      assert.ok(result.attempts >= 1);
    }
    assert.ok(confirmCalls >= 1);
    assert.equal(phase, "preparing");
    assert.equal(sendCalls, 0);
    void sendOutbound;
  });

  it("does not send when delivery is pending or provider acceptance is unknown", async () => {
    let confirmCalls = 0;
    let sendCalls = 0;
    const confirm = async () => {
      confirmCalls += 1;
    };

    const pending = await recoverGeneratedReply(
      {
        replyText: "رد جاهز",
        outboundPhase: "preparing",
        deliveryStatus: "pending",
        hasNewerInbound: false,
        messageId: "msg-out-1",
      },
      confirm,
    );
    const missing = await recoverGeneratedReply(
      {
        replyText: "رد جاهز",
        outboundPhase: "preparing",
        deliveryStatus: null,
        hasNewerInbound: false,
        messageId: "msg-out-1",
      },
      confirm,
    );

    assert.deepEqual(pending, { action: "skip", reason: "delivery_pending" });
    assert.deepEqual(missing, { action: "skip", reason: "acceptance_unconfirmed" });
    assert.equal(confirmCalls, 0);
    assert.equal(sendCalls, 0);

    const failedWithoutId = await recoverGeneratedReply(
      {
        replyText: "رد جاهز",
        outboundPhase: "preparing",
        deliveryStatus: "failed",
        hasNewerInbound: false,
        messageId: "msg-out-1",
        externalMessageId: null,
      },
      confirm,
    );
    assert.deepEqual(failedWithoutId, { action: "skip", reason: "acceptance_unconfirmed" });
    assert.equal(confirmCalls, 0);
    assert.equal(sendCalls, 0);
  });

  it("confirms storage only when a provider id exists and the sent write did not land", async () => {
    let confirmStatus = "";
    let sendCalls = 0;
    const result = await recoverGeneratedReply(
      {
        replyText: "رد جاهز",
        outboundPhase: "preparing",
        deliveryStatus: "pending",
        hasNewerInbound: false,
        messageId: "msg-out-1",
        externalMessageId: "wamid.accepted-1",
      },
      async (input) => {
        confirmStatus = input.status;
      },
    );
    assert.equal(result.action, "confirm_only");
    if (result.action === "confirm_only") assert.equal(result.confirmed, true);
    assert.equal(confirmStatus, "sent");
    assert.equal(sendCalls, 0);
  });

  it("does not send an older reply after a newer inbound, and does not invent a reply without stored text", async () => {
    let sendCalls = 0;

    const newer = await recoverGeneratedReply({
      replyText: "رد قديم",
      deliveryStatus: null,
      hasNewerInbound: true,
      messageId: "msg-out-1",
    });
    const missingText = await recoverGeneratedReply({
      replyText: "  ",
      deliveryStatus: null,
      hasNewerInbound: false,
    });

    assert.deepEqual(newer, { action: "skip", reason: "newer_turn" });
    assert.deepEqual(missingText, { action: "skip", reason: "no_durable_reply" });
    assert.equal(sendCalls, 0);
  });
});
