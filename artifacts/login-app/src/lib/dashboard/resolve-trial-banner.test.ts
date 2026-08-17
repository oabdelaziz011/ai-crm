import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isCompanyOnTrial,
  resolveTrialBanner,
} from "./resolve-trial-banner.ts";

describe("isCompanyOnTrial", () => {
  it("detects Trial company status", () => {
    assert.equal(isCompanyOnTrial({ companyStatus: "Trial" }), true);
  });

  it("detects trialing subscription status", () => {
    assert.equal(isCompanyOnTrial({ subscriptionStatus: "trialing" }), true);
  });

  it("returns false for active paid plans", () => {
    assert.equal(
      isCompanyOnTrial({
        companyStatus: "Active",
        companySubscriptionStatus: "active",
        subscriptionStatus: "active",
      }),
      false,
    );
  });
});

describe("resolveTrialBanner", () => {
  const now = new Date("2026-08-16T12:00:00.000Z");

  it("hides the banner when the viewer cannot see billing", () => {
    assert.equal(
      resolveTrialBanner({
        canView: false,
        companyStatus: "Trial",
        trialEndsAt: "2026-08-30T00:00:00.000Z",
        now,
      }),
      null,
    );
  });

  it("uses trial_ends_at and marks urgency by remaining days", () => {
    const model = resolveTrialBanner({
      canView: true,
      companyStatus: "Trial",
      trialEndsAt: "2026-08-20T00:00:00.000Z",
      now,
    });
    assert.ok(model);
    assert.equal(model.daysRemaining, 4);
    assert.equal(model.urgency, "soon");
  });

  it("falls back to company subscription_expires_at", () => {
    const model = resolveTrialBanner({
      canView: true,
      companySubscriptionStatus: "trialing",
      companyExpiresAt: "2026-08-18T00:00:00.000Z",
      now,
    });
    assert.ok(model);
    assert.equal(model.daysRemaining, 2);
    assert.equal(model.urgency, "critical");
  });

  it("still shows when no end date is known", () => {
    const model = resolveTrialBanner({
      canView: true,
      companyStatus: "Trial",
      now,
    });
    assert.deepEqual(model, {
      endsAt: null,
      daysRemaining: null,
      urgency: "normal",
    });
  });
});
