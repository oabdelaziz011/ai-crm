import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  QUOTE_SEND_CONFIRM_SURFACE_LOCK_MS,
  isRejectConfirmAction,
  shouldLockSendRequestCards,
  takeConfirmAction,
} from "./quote-send-requests-confirm.js";

describe("quote send-requests confirm helpers", () => {
  it("takeConfirmAction preserves approve vs reject distinctly", () => {
    const approve = takeConfirmAction({
      type: "approve" as const,
      item: { quoteId: "q1", quoteNumber: "Q-1" },
    });
    const reject = takeConfirmAction({
      type: "reject" as const,
      item: { quoteId: "q1", quoteNumber: "Q-1" },
    });
    assert.equal(approve?.type, "approve");
    assert.equal(reject?.type, "reject");
    assert.equal(takeConfirmAction(null), null);
  });

  it("null/approve confirm never counts as reject (close-animation regression)", () => {
    assert.equal(isRejectConfirmAction(null), false);
    assert.equal(isRejectConfirmAction(undefined), false);
    assert.equal(isRejectConfirmAction({ type: "approve" }), false);
    assert.equal(isRejectConfirmAction({ type: "reject" }), true);
  });

  it("locks cards while dialog open, surface locked, or mutation busy", () => {
    assert.equal(
      shouldLockSendRequestCards({ confirmOpen: true, surfaceLocked: false, busyQuoteId: null }),
      true,
    );
    assert.equal(
      shouldLockSendRequestCards({ confirmOpen: false, surfaceLocked: true, busyQuoteId: null }),
      true,
    );
    assert.equal(
      shouldLockSendRequestCards({ confirmOpen: false, surfaceLocked: false, busyQuoteId: "q1" }),
      true,
    );
    assert.equal(
      shouldLockSendRequestCards({ confirmOpen: false, surfaceLocked: false, busyQuoteId: null }),
      false,
    );
  });

  it("uses a short lock window after confirm to absorb click-through", () => {
    assert.ok(QUOTE_SEND_CONFIRM_SURFACE_LOCK_MS >= 250);
    assert.ok(QUOTE_SEND_CONFIRM_SURFACE_LOCK_MS <= 1000);
  });
});
