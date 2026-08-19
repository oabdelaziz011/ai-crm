import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateQuotaAccess,
  parsePlanLimitValue,
  resolveEffectiveQuotaPolicyFromSources,
  type EffectiveQuotaPolicy,
} from "./effective-quota-policy.js";

describe("parsePlanLimitValue", () => {
  it("reads monthly from limit_value object", () => {
    assert.equal(parsePlanLimitValue({ monthly: 100 }), 100);
  });
});

describe("resolveEffectiveQuotaPolicyFromSources", () => {
  it("1. no quota configured → not configured", () => {
    const policy = resolveEffectiveQuotaPolicyFromSources({
      companyOverride: null,
      planLimitValue: {},
    });
    assert.equal(policy.configured, false);
    assert.equal(policy.source, "none");
  });

  it("2. plan limit only → uses plan limit", () => {
    const policy = resolveEffectiveQuotaPolicyFromSources({
      companyOverride: null,
      planLimitValue: { monthly: 50 },
    });
    assert.equal(policy.configured, true);
    assert.equal(policy.included_quantity, 50);
    assert.equal(policy.source, "plan_limit");
    assert.equal(policy.overage_allowed, false);
  });

  it("3. company override only → uses company override", () => {
    const policy = resolveEffectiveQuotaPolicyFromSources({
      companyOverride: {
        included_quantity: 25,
        is_unlimited: false,
        overage_allowed: true,
        overage_unit_size: 1000,
        overage_unit_price: 5,
      },
      planLimitValue: { monthly: 50 },
    });
    assert.equal(policy.included_quantity, 25);
    assert.equal(policy.source, "company_override");
    assert.equal(policy.overage_allowed, true);
  });

  it("4. company override beats plan limit", () => {
    const policy = resolveEffectiveQuotaPolicyFromSources({
      companyOverride: {
        included_quantity: 10,
        is_unlimited: false,
        overage_allowed: false,
        overage_unit_size: null,
        overage_unit_price: null,
      },
      planLimitValue: { monthly: 999 },
    });
    assert.equal(policy.included_quantity, 10);
    assert.equal(policy.source, "company_override");
  });

  it("5. unlimited override → allowed regardless of usage", () => {
    const policy = resolveEffectiveQuotaPolicyFromSources({
      companyOverride: {
        included_quantity: null,
        is_unlimited: true,
        overage_allowed: false,
        overage_unit_size: null,
        overage_unit_price: null,
      },
      planLimitValue: { monthly: 1 },
    });
    assert.equal(policy.unlimited, true);
    assert.equal(evaluateQuotaAccess(policy, 1_000_000).allowed, true);
  });
});

describe("evaluateQuotaAccess", () => {
  const limited = (included: number, overageAllowed: boolean): EffectiveQuotaPolicy => ({
    configured: true,
    included_quantity: included,
    unlimited: false,
    overage_allowed: overageAllowed,
    overage_unit_size: overageAllowed ? 1000 : null,
    overage_unit_price: overageAllowed ? 5 : null,
    source: "company_override",
  });

  it("6. under quota → allowed", () => {
    assert.equal(evaluateQuotaAccess(limited(10, false), 9).allowed, true);
  });

  it("7. at quota + overage false → blocked", () => {
    assert.equal(evaluateQuotaAccess(limited(10, false), 10).allowed, false);
  });

  it("8. over quota + overage false → blocked", () => {
    assert.equal(evaluateQuotaAccess(limited(10, false), 11).allowed, false);
  });

  it("9. over quota + overage true → allowed without charge flag only", () => {
    const decision = evaluateQuotaAccess(limited(10, true), 11);
    assert.equal(decision.allowed, true);
    assert.equal(decision.overageApplicable, true);
  });

  it("10. different policies are independent per company inputs", () => {
    const companyA = resolveEffectiveQuotaPolicyFromSources({
      companyOverride: { included_quantity: 5, is_unlimited: false, overage_allowed: false, overage_unit_size: null, overage_unit_price: null },
      planLimitValue: null,
    });
    const companyB = resolveEffectiveQuotaPolicyFromSources({
      companyOverride: null,
      planLimitValue: { monthly: 100 },
    });
    assert.equal(evaluateQuotaAccess(companyA, 5).allowed, false);
    assert.equal(evaluateQuotaAccess(companyB, 5).allowed, true);
  });
});
