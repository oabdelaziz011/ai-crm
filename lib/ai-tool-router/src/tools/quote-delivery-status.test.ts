import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  readAiSendRequest,
  resolveQuoteDeliveryState,
} from "./quote-delivery-status.js";

describe("resolveQuoteDeliveryState", () => {
  it("stays draft when only a draft quote exists", () => {
    const result = resolveQuoteDeliveryState({
      quoteStatus: "draft",
      latestAttempt: null,
      sendRequest: null,
    });
    assert.equal(result.deliveryState, "draft");
    assert.equal(result.sent, false);
  });

  it("does not claim sent for a pending human send request", () => {
    const result = resolveQuoteDeliveryState({
      quoteStatus: "draft",
      latestAttempt: null,
      sendRequest: {
        status: "pending_human_approval",
        channel: "email",
        requestedAt: "2026-01-01T00:00:00.000Z",
        requestedByUserId: "u1",
        conversationId: "c1",
        resolvedAt: null,
        resolvedByUserId: null,
        attemptId: null,
        errorCode: null,
      },
    });
    assert.equal(result.deliveryState, "pending_human_approval");
    assert.equal(result.sent, false);
  });

  it("reports sending while a provider attempt is pending", () => {
    const result = resolveQuoteDeliveryState({
      quoteStatus: "draft",
      latestAttempt: { status: "pending", channel: "email", errorCode: null, createdAt: null },
      sendRequest: null,
    });
    assert.equal(result.deliveryState, "sending");
    assert.equal(result.sent, false);
  });

  it("reports sent only from quote status or a successful attempt", () => {
    assert.equal(
      resolveQuoteDeliveryState({
        quoteStatus: "sent",
        latestAttempt: null,
        sendRequest: null,
      }).sent,
      true,
    );
    assert.equal(
      resolveQuoteDeliveryState({
        quoteStatus: "draft",
        latestAttempt: { status: "sent", channel: "email", errorCode: null, createdAt: null },
        sendRequest: null,
      }).deliveryState,
      "sent",
    );
  });

  it("reports failed from attempt or approved_failed request without marking sent", () => {
    assert.deepEqual(
      resolveQuoteDeliveryState({
        quoteStatus: "draft",
        latestAttempt: {
          status: "failed",
          channel: "whatsapp",
          errorCode: "provider_rejected",
          createdAt: null,
        },
        sendRequest: null,
      }),
      {
        deliveryState: "failed",
        sent: false,
        quoteStatus: "draft",
        attemptStatus: "failed",
        sendRequestStatus: null,
      },
    );
  });
});

describe("readAiSendRequest", () => {
  it("reads a valid metadata payload", () => {
    const req = readAiSendRequest({
      aiSendRequest: {
        status: "pending_human_approval",
        channel: "email",
        requestedAt: "2026-01-01T00:00:00.000Z",
        requestedByUserId: "u1",
        conversationId: "c1",
        resolvedAt: null,
        resolvedByUserId: null,
        attemptId: null,
        errorCode: null,
      },
    });
    assert.equal(req?.channel, "email");
    assert.equal(req?.status, "pending_human_approval");
  });

  it("rejects invalid payloads", () => {
    assert.equal(readAiSendRequest({ aiSendRequest: { status: "nope" } }), null);
    assert.equal(readAiSendRequest(null), null);
  });
});
