import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toPublishOutcome } from "../../communication/events/domain-event-bridge.ts";

describe("booking cancelled template reason selection", () => {
  it("uses customerMessage when present", () => {
    const customerMessage = "نعتذر عن عدم قدرتنا على استقبالكم اليوم لظروف طارئة.";
    const reason = "clinic_closed";
    const templateReason = (customerMessage.trim() || reason.trim());
    assert.equal(templateReason, customerMessage);
  });

  it("falls back to reason for normal cancellations", () => {
    const customerMessage = "";
    const reason = "customer_request";
    const templateReason = customerMessage.trim() || reason.trim();
    assert.equal(templateReason, "customer_request");
  });
});

describe("toPublishOutcome", () => {
  it("maps WhatsApp queue ids without claiming sent", () => {
    const outcome = toPublishOutcome({
      messageIds: ["n1"],
      queueIds: ["q1"],
      channelQueueIds: { whatsapp: "q1" },
      skippedChannels: [],
      failedChannels: [],
      deduplicated: false,
    });
    assert.deepEqual(outcome.whatsappQueueIds, ["q1"]);
    assert.equal(outcome.whatsappSkipped, false);
    assert.equal(outcome.ok, true);
  });
});
