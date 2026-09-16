import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateLegacyFailedOutboundReconcile } from "./lib/legacy-failed-outbound-reconcile.mjs";

const base = {
  message: {
    id: "msg-1",
    message_type: "outgoing",
    status: "pending",
    metadata: { outboundPhase: "preparing" },
  },
  conversation: { id: "conv-1", company_id: "co-1" },
  delivery: {
    id: "del-1",
    company_id: "co-1",
    conversation_id: "conv-1",
    outbound_message_id: "msg-1",
    delivery_status: "failed",
    failed_at: "2026-08-26T23:25:31.461Z",
    error_message: "Authentication Error",
    external_message_id: null,
  },
};

describe("evaluateLegacyFailedOutboundReconcile", () => {
  it("accepts deterministic pending/preparing + linked failed delivery", () => {
    const result = evaluateLegacyFailedOutboundReconcile(base);
    assert.equal(result.eligible, true);
    assert.equal(result.confirmStatus, "failed");
    assert.equal(result.externalMessageId, null);
  });

  it("rejects successful conversation messages", () => {
    const result = evaluateLegacyFailedOutboundReconcile({
      ...base,
      message: { ...base.message, status: "sent", metadata: { outboundPhase: "sent", dispatchConfirmed: true } },
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "successful_message_protected");
  });

  it("rejects company mismatch", () => {
    const result = evaluateLegacyFailedOutboundReconcile({
      ...base,
      delivery: { ...base.delivery, company_id: "other-co" },
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "company_mismatch");
  });

  it("rejects missing outbound_message_id link", () => {
    const result = evaluateLegacyFailedOutboundReconcile({
      ...base,
      delivery: { ...base.delivery, outbound_message_id: null },
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "outbound_message_id_mismatch");
  });

  it("rejects delivery without failure evidence", () => {
    const result = evaluateLegacyFailedOutboundReconcile({
      ...base,
      delivery: {
        ...base.delivery,
        failed_at: null,
        error_message: null,
      },
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "no_failure_evidence");
  });

  it("is idempotent for already-failed messages", () => {
    const result = evaluateLegacyFailedOutboundReconcile({
      ...base,
      message: {
        ...base.message,
        status: "failed",
        metadata: { outboundPhase: "failed", dispatchFailed: true },
      },
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "already_failed_idempotent");
  });
});
