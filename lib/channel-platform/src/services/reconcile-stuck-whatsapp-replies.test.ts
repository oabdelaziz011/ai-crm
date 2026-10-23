import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planStuckWhatsAppReplyRecovery, toStuckWhatsAppReply } from "./reconcile-stuck-whatsapp-replies.js";
import type { StuckWhatsAppReply } from "./reconcile-stuck-whatsapp-replies.js";

function candidate(overrides: Partial<StuckWhatsAppReply> = {}): StuckWhatsAppReply {
  return {
    messageId: "msg-out-1",
    replyText: "رد محفوظ",
    outboundPhase: "preparing",
    deliveryStatus: "sent",
    hasNewerInbound: false,
    externalMessageId: "wamid.out-1",
    recoveryAttempts: 0,
    recoveryDisposition: null,
    ageMs: 180_000,
    ...overrides,
  };
}

describe("toStuckWhatsAppReply", () => {
  it("keeps durable text, phase, and prior recovery attempts", () => {
    const row = toStuckWhatsAppReply({
      id: "msg-1",
      content: "رد محفوظ",
      createdAt: "2026-10-21T08:00:00.000Z",
      metadata: { outboundPhase: "preparing", whatsappRecoveryAttempts: 2 },
      deliveryStatus: null,
      hasNewerInbound: false,
      nowMs: Date.parse("2026-10-21T08:03:00.000Z"),
    });
    assert.equal(row.replyText, "رد محفوظ");
    assert.equal(row.outboundPhase, "preparing");
    assert.equal(row.recoveryAttempts, 2);
    assert.equal(row.ageMs, 180_000);
    assert.equal(row.deliveryStatus, null);
  });
});

describe("planStuckWhatsAppReplyRecovery", () => {
  it("confirms an accepted delivery and does not send", async () => {
    let confirmCalls = 0;
    let sendCalls = 0;
    const decisions = await planStuckWhatsAppReplyRecovery([candidate()], async (input) => {
      confirmCalls += 1;
      assert.equal(input.status, "sent");
    });
    assert.equal(decisions[0]?.disposition, "confirmed");
    assert.equal(confirmCalls, 1);
    assert.equal(sendCalls, 0);
  });

  it("holds pending and unknown acceptance for review without sending", async () => {
    let confirmCalls = 0;
    let sendCalls = 0;
    const decisions = await planStuckWhatsAppReplyRecovery(
      [
        candidate({ messageId: "pending", deliveryStatus: "pending", externalMessageId: null }),
        candidate({ messageId: "missing", deliveryStatus: null, externalMessageId: null }),
        candidate({ messageId: "accepted-unsent", deliveryStatus: "pending", externalMessageId: "wamid.kept" }),
      ],
      async (input) => {
        confirmCalls += 1;
        assert.equal(input.messageId, "accepted-unsent");
        assert.equal(input.status, "sent");
        assert.equal(input.externalMessageId, "wamid.kept");
      },
    );
    assert.equal(decisions[0]?.disposition, "needs_review");
    assert.equal(decisions[0]?.outcome.action, "skip");
    if (decisions[0]?.outcome.action === "skip") assert.equal(decisions[0].outcome.reason, "delivery_pending");
    assert.equal(decisions[1]?.disposition, "needs_review");
    if (decisions[1]?.outcome.action === "skip") {
      assert.equal(decisions[1].outcome.reason, "acceptance_unconfirmed");
    }
    assert.equal(decisions[2]?.disposition, "confirmed");
    assert.equal(decisions[2]?.outcome.action, "confirm_only");
    assert.equal(confirmCalls, 1);
    assert.equal(sendCalls, 0);
  });

  it("leaves a fresh in-flight row untouched and does not revisit a settled row", async () => {
    let confirmCalls = 0;
    const decisions = await planStuckWhatsAppReplyRecovery(
      [
        candidate({ messageId: "fresh", ageMs: 1_000 }),
        candidate({ messageId: "held", recoveryDisposition: "needs_review" }),
      ],
      async () => {
        confirmCalls += 1;
      },
      { graceMs: 120_000 },
    );
    assert.equal(decisions[0]?.disposition, "in_flight");
    assert.equal(decisions[0]?.persisted, false);
    assert.equal(decisions[1]?.disposition, "unchanged");
    assert.equal(confirmCalls, 0);
  });

  it("two planners can confirm the same accepted row without sending", async () => {
    let confirmCalls = 0;
    let sendCalls = 0;
    const row = candidate();
    const [first, second] = await Promise.all([
      planStuckWhatsAppReplyRecovery([row], async () => {
        confirmCalls += 1;
      }),
      planStuckWhatsAppReplyRecovery([row], async () => {
        confirmCalls += 1;
      }),
    ]);
    assert.equal(first[0]?.disposition, "confirmed");
    assert.equal(second[0]?.disposition, "confirmed");
    assert.equal(confirmCalls, 2);
    assert.equal(sendCalls, 0);
  });

  it("stops retrying a confirm failure and does not send", async () => {
    let sendCalls = 0;
    const decisions = await planStuckWhatsAppReplyRecovery(
      [candidate({ recoveryAttempts: 2 })],
      async () => {
        throw new Error("confirm rpc unavailable");
      },
      { maxAttempts: 3 },
    );
    assert.equal(decisions[0]?.disposition, "needs_review");
    assert.equal(decisions[0]?.outcome.action, "confirm_only");
    if (decisions[0]?.outcome.action === "confirm_only") assert.equal(decisions[0].outcome.confirmed, false);
    assert.equal(sendCalls, 0);
  });
});
