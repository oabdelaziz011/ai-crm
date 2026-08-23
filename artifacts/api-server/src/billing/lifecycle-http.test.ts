import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampLifecycleEnforceLimit,
  hasClientSuppliedCompanyId,
  isBillingLifecycleWorkerEnabled,
  LIFECYCLE_ENFORCE_MAX_LIMIT,
  resolveInternalLifecycleAuth,
} from "./lifecycle-http.js";

describe("lifecycle HTTP auth and bounds", () => {
  it("TEST 10: tenant JWT / non-matching Bearer is denied", () => {
    const result = resolveInternalLifecycleAuth({
      configuredKey: "internal-secret",
      authorizationHeader: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.tenant",
      internalKeyHeader: undefined,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 401);
      assert.equal(result.code, "unauthorized");
    }
  });

  it("TEST 11: missing INTERNAL_API_KEY fails closed", () => {
    const missing = resolveInternalLifecycleAuth({
      configuredKey: undefined,
      authorizationHeader: "Bearer anything",
      internalKeyHeader: "anything",
    });
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.status, 503);
      assert.equal(missing.code, "internal_key_missing");
    }

    const invalid = resolveInternalLifecycleAuth({
      configuredKey: "internal-secret",
      authorizationHeader: undefined,
      internalKeyHeader: "wrong-key",
    });
    assert.equal(invalid.ok, false);
    if (!invalid.ok) {
      assert.equal(invalid.status, 401);
    }
  });

  it("TEST 11b: matching internal key is accepted", () => {
    const viaHeader = resolveInternalLifecycleAuth({
      configuredKey: "internal-secret",
      authorizationHeader: undefined,
      internalKeyHeader: "internal-secret",
    });
    assert.equal(viaHeader.ok, true);

    const viaBearer = resolveInternalLifecycleAuth({
      configuredKey: "internal-secret",
      authorizationHeader: "Bearer internal-secret",
      internalKeyHeader: undefined,
    });
    assert.equal(viaBearer.ok, true);
  });

  it("TEST 12: batch limit is bounded", () => {
    assert.equal(clampLifecycleEnforceLimit(undefined), 100);
    assert.equal(clampLifecycleEnforceLimit(10), 10);
    assert.equal(clampLifecycleEnforceLimit(0), 1);
    assert.equal(clampLifecycleEnforceLimit(9999), LIFECYCLE_ENFORCE_MAX_LIMIT);
    assert.equal(clampLifecycleEnforceLimit("nope"), 100);
  });

  it("does not treat client company_id as an execution selector", () => {
    assert.equal(hasClientSuppliedCompanyId({ company_id: "abc" }, {}), true);
    assert.equal(hasClientSuppliedCompanyId({ limit: 10 }, {}), false);
  });

  it("worker stays off unless explicitly enabled", () => {
    assert.equal(isBillingLifecycleWorkerEnabled({}), false);
    assert.equal(isBillingLifecycleWorkerEnabled({ BILLING_LIFECYCLE_WORKER_ENABLED: "false" }), false);
    assert.equal(isBillingLifecycleWorkerEnabled({ BILLING_LIFECYCLE_WORKER_ENABLED: "true" }), true);
  });
});
