import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  quoteSendRequestDeliveryLabelKey,
  resolveQuoteSendRequestsInboxState,
} from "./quote-send-requests-ui.js";

describe("resolveQuoteSendRequestsInboxState", () => {
  it("forbids users without quotes.send before loading", () => {
    assert.equal(
      resolveQuoteSendRequestsInboxState({
        canSend: false,
        isLoading: true,
        hasError: false,
        itemCount: 0,
      }),
      "forbidden",
    );
  });

  it("reports loading, error, empty, and ready", () => {
    assert.equal(
      resolveQuoteSendRequestsInboxState({
        canSend: true,
        isLoading: true,
        hasError: false,
        itemCount: 0,
      }),
      "loading",
    );
    assert.equal(
      resolveQuoteSendRequestsInboxState({
        canSend: true,
        isLoading: false,
        hasError: true,
        itemCount: 0,
      }),
      "error",
    );
    assert.equal(
      resolveQuoteSendRequestsInboxState({
        canSend: true,
        isLoading: false,
        hasError: false,
        itemCount: 0,
      }),
      "empty",
    );
    assert.equal(
      resolveQuoteSendRequestsInboxState({
        canSend: true,
        isLoading: false,
        hasError: false,
        itemCount: 2,
      }),
      "ready",
    );
  });
});

describe("quoteSendRequestDeliveryLabelKey", () => {
  it("does not claim sent for a pending request alone", () => {
    assert.equal(
      quoteSendRequestDeliveryLabelKey({
        deliveryState: "pending_human_approval",
        sent: false,
      }),
      "quotes.sendRequests.status.pending_human_approval",
    );
  });

  it("claims sent only from an approve result with sent:true", () => {
    assert.equal(
      quoteSendRequestDeliveryLabelKey(
        { deliveryState: "pending_human_approval", sent: false },
        { sent: true, deliveryState: "sent" },
      ),
      "quotes.sendRequests.status.sent",
    );
    assert.equal(
      quoteSendRequestDeliveryLabelKey(
        { deliveryState: "pending_human_approval", sent: false },
        { sent: false, deliveryState: "failed" },
      ),
      "quotes.sendRequests.status.failed",
    );
  });
});
