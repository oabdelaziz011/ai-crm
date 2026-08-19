/**
 * Part 4 eligibility — pending pre-approval payment + company payable.
 * Run: npx --yes tsx --test artifacts/login-app/scripts/saas-payment-eligibility.test.mts
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

const allowedInput = {
  canInitiate: true,
  companyId: "c1",
  companyStatus: "Active",
  approvalStatus: "approved",
  subscription: { status: "active" as const, billing_cycle: "monthly" as const, plan_id: "p1" },
  plan: basePlan,
};

describe("resolveSaasPaymentEligibility", () => {
  it("allows active / past_due / grace / trialing for admins", () => {
    for (const status of ["active", "past_due", "grace_period", "trialing"] as const) {
      const r = resolveSaasPaymentEligibility({
        ...allowedInput,
        subscription: { status, billing_cycle: "monthly", plan_id: "p1" },
      });
      assert.equal(r.allowed, true, status);
      assert.equal(r.code, "PAYMENT_ALLOWED");
      assert.equal(r.action, status === "past_due" || status === "grace_period" ? "renew" : "pay");
    }
  });

  it("allows pending configured companies to pay", () => {
    const r = resolveSaasPaymentEligibility({
      ...allowedInput,
      companyStatus: "Trial",
      approvalStatus: "pending",
      payableAmount: 179.1,
      payableSource: "discount",
      onlineCheckoutAllowed: true,
    });
    assert.equal(r.allowed, true);
    assert.equal(r.code, "PAYMENT_ALLOWED");
  });

  it("blocks unauthorized, suspended, rejected, free, custom, canceled", () => {
    assert.equal(
      resolveSaasPaymentEligibility({ ...allowedInput, canInitiate: false }).code,
      "UNAUTHORIZED",
    );

    assert.equal(
      resolveSaasPaymentEligibility({
        ...allowedInput,
        companyStatus: "Suspended",
      }).code,
      "PAYMENT_BLOCKED",
    );

    assert.equal(
      resolveSaasPaymentEligibility({
        ...allowedInput,
        approvalStatus: "rejected",
      }).code,
      "PAYMENT_BLOCKED",
    );

    assert.equal(
      resolveSaasPaymentEligibility({
        ...allowedInput,
        plan: { ...basePlan, pricing_mode: "free", price_monthly: 0, price_yearly: 0 },
      }).code,
      "FREE_PACKAGE",
    );

    assert.equal(
      resolveSaasPaymentEligibility({
        ...allowedInput,
        plan: { ...basePlan, pricing_mode: "custom" },
      }).code,
      "CUSTOM_PRICING",
    );

    assert.equal(
      resolveSaasPaymentEligibility({
        ...allowedInput,
        subscription: { status: "canceled", billing_cycle: "monthly", plan_id: "p1" },
      }).code,
      "INVALID_SUBSCRIPTION_STATE",
    );
  });

  it("blocks pending without package or valid price, and after payment", () => {
    assert.equal(
      resolveSaasPaymentEligibility({
        ...allowedInput,
        approvalStatus: "pending",
        subscription: { status: "trialing", billing_cycle: "monthly", plan_id: null },
        plan: null,
      }).code,
      "NOT_CONFIGURED",
    );

    assert.equal(
      resolveSaasPaymentEligibility({
        ...allowedInput,
        approvalStatus: "pending",
        payableAmount: 0,
        onlineCheckoutAllowed: false,
      }).code,
      "NOT_CONFIGURED",
    );

    assert.equal(
      resolveSaasPaymentEligibility({
        ...allowedInput,
        approvalStatus: "pending",
        preApprovalPaid: true,
        payableAmount: 179.1,
      }).code,
      "AWAITING_APPROVAL",
    );
  });

  it("expectedListPriceAmount uses billing cycle", () => {
    assert.equal(expectedListPriceAmount({ billing_cycle: "monthly" }, basePlan), 80);
    assert.equal(expectedListPriceAmount({ billing_cycle: "yearly" }, basePlan), 800);
  });
});
