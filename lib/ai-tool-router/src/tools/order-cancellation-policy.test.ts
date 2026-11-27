import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ORDER_CANCELLATION_AI_POLICY,
  ORDER_CANCELLATION_POLICY_VERSION,
  classifyCancellationEligibility,
} from "./order-cancellation-policy.js";

describe("order cancellation policy", () => {
  it("classifies direct cancel statuses", () => {
    for (const status of ["pending_approval", "confirmed"]) {
      const result = classifyCancellationEligibility(status, false);
      assert.equal(result.path, "direct");
      assert.equal(result.code, "direct_cancel");
    }
  });

  it("classifies request-required statuses", () => {
    for (const status of ["processing", "out_for_delivery"]) {
      const result = classifyCancellationEligibility(status, false);
      assert.equal(result.path, "request");
      assert.equal(result.code, "request_required");
    }
  });

  it("rejects delivered and already cancelled", () => {
    assert.equal(classifyCancellationEligibility("delivered", false).code, "not_allowed_delivered");
    assert.equal(classifyCancellationEligibility("cancelled", false).code, "already_cancelled");
  });

  it("prefers pending request over path", () => {
    const result = classifyCancellationEligibility("processing", true);
    assert.equal(result.code, "pending_request_exists");
    assert.equal(result.path, "none");
  });

  it("exposes AI policy with confirmation and refund rules", () => {
    assert.match(ORDER_CANCELLATION_AI_POLICY, new RegExp(ORDER_CANCELLATION_POLICY_VERSION));
    assert.match(ORDER_CANCELLATION_AI_POLICY, /explicit confirmation/i);
    assert.match(ORDER_CANCELLATION_AI_POLICY, /Never promise refunds/i);
    assert.match(ORDER_CANCELLATION_AI_POLICY, /pending_approval or confirmed/);
    assert.match(ORDER_CANCELLATION_AI_POLICY, /processing or out_for_delivery/);
  });
});
