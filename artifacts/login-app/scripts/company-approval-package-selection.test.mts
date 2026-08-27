/**
 * Company review package selection: trialing/pending must use assign, not change.
 * Run: npx --yes tsx --test scripts/company-approval-package-selection.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  resolveReviewSelectedPlanId,
  shouldAssignPackageDuringReview,
} from "../src/lib/companies/company-approval-package-selection.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("company approval package selection", () => {
  it("uses assign during pending review even when a plan is already selected", () => {
    assert.equal(
      shouldAssignPackageDuringReview({
        pending: true,
        subscriptionStatus: "trialing",
        subscriptionPlanId: "plan-basic",
      }),
      true,
    );
  });

  it("uses assign for trialing subscriptions outside pending review when no paid change path", () => {
    assert.equal(
      shouldAssignPackageDuringReview({
        pending: false,
        subscriptionStatus: "trialing",
        subscriptionPlanId: "plan-basic",
      }),
      true,
    );
  });

  it("uses assign when subscription has no plan yet", () => {
    assert.equal(
      shouldAssignPackageDuringReview({
        pending: false,
        subscriptionStatus: "active",
        subscriptionPlanId: null,
      }),
      true,
    );
  });

  it("uses change for active paid subscriptions with an assigned plan", () => {
    assert.equal(
      shouldAssignPackageDuringReview({
        pending: false,
        subscriptionStatus: "active",
        subscriptionPlanId: "plan-pro",
      }),
      false,
    );
  });

  it("does not fall back to company.plan_id while review is pending", () => {
    assert.equal(
      resolveReviewSelectedPlanId({
        pending: true,
        subscriptionPlanId: null,
        companyPlanId: "denorm-basic",
      }),
      null,
    );
  });

  it("falls back to company.plan_id after approval for read-only review", () => {
    assert.equal(
      resolveReviewSelectedPlanId({
        pending: false,
        subscriptionPlanId: null,
        companyPlanId: "denorm-pro",
      }),
      "denorm-pro",
    );
  });
});

describe("company approval workspace wiring", () => {
  it("routes pending/trialing package clicks through assign helper", () => {
    const workspace = readFileSync(
      join(root, "src/components/companies/approval/company-approval-workspace.tsx"),
      "utf8",
    );
    const billing = readFileSync(join(root, "src/hooks/billing/use-billing-edit.ts"), "utf8");

    assert.match(workspace, /shouldAssignPackageDuringReview/);
    assert.match(workspace, /resolveReviewSelectedPlanId/);
    assert.match(workspace, /await subscriptionQuery\.refetch\(\)/);
    assert.match(billing, /company-subscription-review/);
  });
});
