/**
 * Part 4 — SaaS payment eligibility (pure).
 * Run: npx --yes tsx --test scripts/saas-payment-eligibility.test.mts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  expectedListPriceAmount,
  resolveSaasPaymentEligibility,
} from "../src/lib/billing/saas-payment-eligibility.ts";

const basePlan = {
  pricing_mode: "fixed",
  price_monthly: 80,
  price_yearly: 800,
};

describe("resolveSaasPaymentEligibility", () => {
  it("allows active / past_due / grace / trialing for admins", () => {
    for (const status of ["active", "past_due", "grace_period", "trialing"] as const) {
      const r = resolveSaasPaymentEligibility({
        canInitiate: true,
        companyId: "c1",
        companyStatus: "Active",
        approvalStatus: "approved",
        subscription: { status, billing_cycle: "monthly", plan_id: "p1" },
        plan: basePlan,
      });
      assert.equal(r.allowed, true, status);
      assert.equal(r.code, "PAYMENT_ALLOWED");
      assert.equal(r.action, status === "past_due" || status === "grace_period" ? "renew" : "pay");
    }
  });

  it("blocks unauthorized, suspended, pending, free, custom, canceled", () => {
    assert.equal(
      resolveSaasPaymentEligibility({
        canInitiate: false,
        companyId: "c1",
        companyStatus: "Active",
        approvalStatus: "approved",
        subscription: { status: "active", billing_cycle: "monthly", plan_id: "p1" },
        plan: basePlan,
      }).code,
      "UNAUTHORIZED",
    );

    assert.equal(
      resolveSaasPaymentEligibility({
        canInitiate: true,
        companyId: "c1",
        companyStatus: "Suspended",
        approvalStatus: "approved",
        subscription: { status: "active", billing_cycle: "monthly", plan_id: "p1" },
        plan: basePlan,
      }).code,
      "PAYMENT_BLOCKED",
    );

    assert.equal(
      resolveSaasPaymentEligibility({
        canInitiate: true,
        companyId: "c1",
        companyStatus: "Active",
        approvalStatus: "pending",
        subscription: { status: "active", billing_cycle: "monthly", plan_id: "p1" },
        plan: basePlan,
      }).code,
      "PAYMENT_BLOCKED",
    );

    assert.equal(
      resolveSaasPaymentEligibility({
        canInitiate: true,
        companyId: "c1",
        companyStatus: "Active",
        approvalStatus: "approved",
        subscription: { status: "active", billing_cycle: "monthly", plan_id: "p1" },
        plan: { ...basePlan, pricing_mode: "free", price_monthly: 0, price_yearly: 0 },
      }).code,
      "FREE_PACKAGE",
    );

    assert.equal(
      resolveSaasPaymentEligibility({
        canInitiate: true,
        companyId: "c1",
        companyStatus: "Active",
        approvalStatus: "approved",
        subscription: { status: "active", billing_cycle: "monthly", plan_id: "p1" },
        plan: { ...basePlan, pricing_mode: "custom" },
      }).code,
      "CUSTOM_PRICING",
    );

    assert.equal(
      resolveSaasPaymentEligibility({
        canInitiate: true,
        companyId: "c1",
        companyStatus: "Active",
        approvalStatus: "approved",
        subscription: { status: "canceled", billing_cycle: "monthly", plan_id: "p1" },
        plan: basePlan,
      }).code,
      "INVALID_SUBSCRIPTION_STATE",
    );
  });

  it("expectedListPriceAmount uses billing cycle", () => {
    assert.equal(
      expectedListPriceAmount({ billing_cycle: "monthly" }, basePlan),
      80,
    );
    assert.equal(
      expectedListPriceAmount({ billing_cycle: "yearly" }, basePlan),
      800,
    );
  });
});
