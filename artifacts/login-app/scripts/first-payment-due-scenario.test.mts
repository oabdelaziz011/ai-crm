/**
 * First-subscription payment scenario matrix — local verification.
 *
 * Covers the product flow we built:
 *  1) Staff never see pay highlight
 *  2) Approaching (≤7 days) → soft highlight + pay CTA
 *  3) Due today → critical + pay
 *  4) Unpaid (past_due / grace) → soft unpaid, workspace still open
 *  5) Paid/active far from renewal → no highlight
 *  6) Suspended → locked, no pay CTA (company-wide lock)
 *  7) Super-admin overdue notification deep-links to company subscription
 *  8) Only company admins can initiate online payment; Suspended blocks checkout
 *
 * Run:
 *   pnpm exec tsx --test scripts/first-payment-due-scenario.test.mts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveSubscriptionPaymentNotice,
  SUBSCRIPTION_PAYMENT_REMINDER_DAYS,
} from "../src/lib/dashboard/resolve-subscription-payment-notice.ts";
import { resolveSaasPaymentEligibility } from "../src/lib/billing/saas-payment-eligibility.ts";
import { resolveNotificationHref } from "../src/lib/notifications/resolve-notification-href.ts";
import type { Notification } from "../src/lib/notifications/types/index.ts";

const now = new Date("2026-09-22T12:00:00.000Z");
const COMPANY_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function notice(partial: Parameters<typeof resolveSubscriptionPaymentNotice>[0]) {
  return resolveSubscriptionPaymentNotice({ now, reminderDays: SUBSCRIPTION_PAYMENT_REMINDER_DAYS, ...partial });
}

function fakeNotification(messagePayload: string): Notification {
  return {
    id: "n1",
    companyId: COMPANY_ID,
    recipient: { userId: "sa-1", companyId: COMPANY_ID },
    templateKey: "subscription.unpaid",
    titleKey: "Company subscription unpaid",
    messagePayload,
    event: null,
    status: "delivered",
    priority: "high",
    channel: "in_app",
    visualType: "warning",
    category: "subscription",
    isRead: false,
    archivedAt: null,
    createdAt: now.toISOString(),
  };
}

describe("Scenario A — staff never see payment highlight", () => {
  it("returns null when canView=false even if due in 2 days", () => {
    assert.equal(
      notice({
        canView: false,
        subscriptionStatus: "trialing",
        trialEndsAt: "2026-09-24T00:00:00.000Z",
      }),
      null,
    );
  });
});

describe("Scenario B — approaching renewal (super-admin set due date)", () => {
  it("shows countdown highlight 4 days before due", () => {
    const model = notice({
      canView: true,
      companyStatus: "Trial",
      subscriptionStatus: "trialing",
      trialEndsAt: "2026-09-26T00:00:00.000Z",
    });
    assert.ok(model);
    assert.equal(model.phase, "approaching");
    assert.equal(model.daysRemaining, 4);
    assert.equal(model.showPayCta, true);
    assert.equal(model.blocksWorkspace, false);
  });

  it("hides when due is beyond the 7-day reminder window", () => {
    assert.equal(
      notice({
        canView: true,
        subscriptionStatus: "trialing",
        trialEndsAt: "2026-10-15T00:00:00.000Z",
      }),
      null,
    );
  });
});

describe("Scenario C — due today: critical highlight, still usable", () => {
  it("phase=due_today with pay CTA", () => {
    const model = notice({
      canView: true,
      subscriptionStatus: "trialing",
      trialEndsAt: "2026-09-22T00:00:00.000Z",
    });
    assert.ok(model);
    assert.equal(model.phase, "due_today");
    assert.equal(model.urgency, "critical");
    assert.equal(model.showPayCta, true);
    assert.equal(model.blocksWorkspace, false);
  });
});

describe("Scenario D — unpaid soft warn (past_due / grace): work continues", () => {
  it("past_due → unpaid highlight, workspace open, pay CTA on", () => {
    const model = notice({
      canView: true,
      companyStatus: "Active",
      subscriptionStatus: "past_due",
      nextRenewalAt: "2026-09-18T00:00:00.000Z",
    });
    assert.ok(model);
    assert.equal(model.phase, "unpaid");
    assert.equal(model.blocksWorkspace, false);
    assert.equal(model.showPayCta, true);
  });

  it("grace_period → unpaid highlight, workspace open", () => {
    const model = notice({
      canView: true,
      subscriptionStatus: "grace_period",
      gracePeriodEndsAt: "2026-09-25T00:00:00.000Z",
      nextRenewalAt: "2026-09-18T00:00:00.000Z",
    });
    assert.ok(model);
    assert.equal(model.phase, "unpaid");
    assert.equal(model.blocksWorkspace, false);
    assert.equal(model.showPayCta, true);
  });
});

describe("Scenario E — after successful payment: no highlight", () => {
  it("active + far renewal → null (highlight cleared)", () => {
    assert.equal(
      notice({
        canView: true,
        companyStatus: "Active",
        subscriptionStatus: "active",
        nextRenewalAt: "2026-12-01T00:00:00.000Z",
      }),
      null,
    );
  });
});

describe("Scenario F — company-wide lock when Suspended", () => {
  it("locked phase, no pay CTA, blocksWorkspace=true", () => {
    const model = notice({
      canView: true,
      companyStatus: "Suspended",
      subscriptionStatus: "expired",
    });
    assert.ok(model);
    assert.equal(model.phase, "locked");
    assert.equal(model.showPayCta, false);
    assert.equal(model.blocksWorkspace, true);
  });
});

describe("Scenario G — super-admin notification → company subscription", () => {
  it("navigationTarget deep-links to subject company subscription detail", () => {
    const href = resolveNotificationHref(
      fakeNotification(
        JSON.stringify({
          body: "Acme exhausted its payment window without renewing.",
          params: {
            companyId: COMPANY_ID,
            companyName: "Acme",
            entityType: "company",
            entityId: COMPANY_ID,
            navigationTarget: `/dashboard/subscriptions/${COMPANY_ID}`,
          },
        }),
      ),
    );
    assert.equal(href, `~/dashboard/subscriptions/${COMPANY_ID}`);
  });

  it("companyId fallback without navigationTarget still opens subscription detail", () => {
    const href = resolveNotificationHref(
      fakeNotification(
        JSON.stringify({
          body: "Unpaid",
          params: {
            companyId: COMPANY_ID,
            entityType: "company",
            entityId: COMPANY_ID,
          },
        }),
      ),
    );
    assert.equal(href, `~/dashboard/subscriptions/${COMPANY_ID}`);
  });
});

describe("Scenario H — pay path: admin only; Suspended blocked", () => {
  const plan = { pricing_mode: "fixed", price_monthly: 99, price_yearly: 990 };
  const base = {
    companyId: COMPANY_ID,
    companyStatus: "Active",
    approvalStatus: "approved",
    subscription: { status: "trialing" as const, billing_cycle: "monthly" as const, plan_id: "p1" },
    plan,
  };

  it("staff cannot initiate online payment", () => {
    const r = resolveSaasPaymentEligibility({ ...base, canInitiate: false });
    assert.equal(r.allowed, false);
    assert.equal(r.code, "UNAUTHORIZED");
  });

  it("company admin can pay while trialing / past_due", () => {
    for (const status of ["trialing", "past_due"] as const) {
      const r = resolveSaasPaymentEligibility({
        ...base,
        canInitiate: true,
        subscription: { status, billing_cycle: "monthly", plan_id: "p1" },
      });
      assert.equal(r.allowed, true, status);
    }
  });

  it("Suspended company cannot start checkout (hard lock)", () => {
    const r = resolveSaasPaymentEligibility({
      ...base,
      canInitiate: true,
      companyStatus: "Suspended",
    });
    assert.equal(r.allowed, false);
    assert.equal(r.code, "PAYMENT_BLOCKED");
  });
});
