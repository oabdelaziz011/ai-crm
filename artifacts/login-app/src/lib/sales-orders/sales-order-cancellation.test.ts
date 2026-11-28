import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCancellationWorkerMessage } from "./sales-order-cancellation-message.js";

describe("sales order cancellation helpers", () => {
  it("builds worker WhatsApp message with optional reason", () => {
    const withReason = buildCancellationWorkerMessage({
      orderNumber: "SO-2026-0012",
      customerName: "Ahmed Mohamed",
      cancellationReason: "Changed mind",
    });
    assert.match(withReason, /Order Cancellation Notice/);
    assert.match(withReason, /SO-2026-0012/);
    assert.match(withReason, /Ahmed Mohamed/);
    assert.match(withReason, /Reason: Changed mind/);

    const without = buildCancellationWorkerMessage({
      orderNumber: "SO-2026-0012",
      customerName: "Ahmed Mohamed",
      cancellationReason: null,
    });
    assert.equal(/Reason:/.test(without), false);
  });
});
