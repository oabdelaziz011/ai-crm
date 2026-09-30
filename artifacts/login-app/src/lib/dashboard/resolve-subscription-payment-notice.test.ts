import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolvePaymentDueAt,
  resolveSubscriptionPaymentNotice,
  SUBSCRIPTION_PAYMENT_REMINDER_DAYS,
} from "./resolve-subscription-payment-notice.ts";

const now = new Date("2026-09-22T12:00:00.000Z");

describe("resolvePaymentDueAt", () => {
  it("prefers trial_ends_at while trialing", () => {
    const due = resolvePaymentDueAt({
      subscriptionStatus: "trialing",
      trialEndsAt: "2026-09-30T00:00:00.000Z",
      nextRenewalAt: "2026-10-01T00:00:00.000Z",
    });
    assert.equal(due?.toISOString().slice(0, 10), "2026-09-30");
  });

  it("prefers grace_period_ends_at in grace", () => {
    const due = resolvePaymentDueAt({
      subscriptionStatus: "grace_period",
      gracePeriodEndsAt: "2026-09-25T00:00:00.000Z",
      nextRenewalAt: "2026-09-20T00:00:00.000Z",
    });
    assert.equal(due?.toISOString().slice(0, 10), "2026-09-25");
  });
});

describe("resolveSubscriptionPaymentNotice", () => {
  it("hides for staff without billing permission", () => {
    assert.equal(
      resolveSubscriptionPaymentNotice({
        canView: false,
        subscriptionStatus: "trialing",
        trialEndsAt: "2026-09-25T00:00:00.000Z",
        now,
      }),
      null,
    );
  });

  it("shows approaching with days remaining inside reminder window", () => {
    const model = resolveSubscriptionPaymentNotice({
      canView: true,
      companyStatus: "Trial",
      subscriptionStatus: "trialing",
      trialEndsAt: "2026-09-26T00:00:00.000Z",
      now,
    });
    assert.ok(model);
    assert.equal(model.phase, "approaching");
    assert.equal(model.daysRemaining, 4);
    assert.equal(model.urgency, "soon");
    assert.equal(model.showPayCta, true);
    assert.equal(model.blocksWorkspace, false);
  });

  it("hides when due date is beyond reminder window", () => {
    assert.equal(
      resolveSubscriptionPaymentNotice({
        canView: true,
        subscriptionStatus: "trialing",
        trialEndsAt: "2026-10-20T00:00:00.000Z",
        reminderDays: SUBSCRIPTION_PAYMENT_REMINDER_DAYS,
        now,
      }),
      null,
    );
  });

  it("marks due_today when daysRemaining is 0", () => {
    const model = resolveSubscriptionPaymentNotice({
      canView: true,
      subscriptionStatus: "trialing",
      trialEndsAt: "2026-09-22T00:00:00.000Z",
      now,
    });
    assert.ok(model);
    assert.equal(model.phase, "due_today");
    assert.equal(model.urgency, "critical");
  });

  it("shows unpaid soft notice for past_due without locking workspace", () => {
    const model = resolveSubscriptionPaymentNotice({
      canView: true,
      subscriptionStatus: "past_due",
      nextRenewalAt: "2026-09-20T00:00:00.000Z",
      now,
    });
    assert.ok(model);
    assert.equal(model.phase, "unpaid");
    assert.equal(model.blocksWorkspace, false);
    assert.equal(model.showPayCta, true);
  });

  it("shows locked phase when company is Suspended", () => {
    const model = resolveSubscriptionPaymentNotice({
      canView: true,
      companyStatus: "Suspended",
      subscriptionStatus: "past_due",
      now,
    });
    assert.ok(model);
    assert.equal(model.phase, "locked");
    assert.equal(model.blocksWorkspace, true);
    assert.equal(model.showPayCta, false);
  });

  it("hides for healthy active subscriptions far from renewal", () => {
    assert.equal(
      resolveSubscriptionPaymentNotice({
        canView: true,
        companyStatus: "Active",
        subscriptionStatus: "active",
        nextRenewalAt: "2026-12-01T00:00:00.000Z",
        now,
      }),
      null,
    );
  });
});
