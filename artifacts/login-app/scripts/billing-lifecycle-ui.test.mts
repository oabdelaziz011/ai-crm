/**
 * Phase 7.9B — billing lifecycle admin UI wiring.
 * Run: npx --yes tsx --test scripts/billing-lifecycle-ui.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  clampLifecycleEnforcementLimit,
  LIFECYCLE_ENFORCEMENT_DEFAULT_LIMIT,
  LIFECYCLE_ENFORCEMENT_MAX_LIMIT,
  summarizeLifecycleEnforcementResult,
} from "../src/lib/billing/lifecycle-enforcement-summary.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Phase 7.9B billing lifecycle UI", () => {
  it("Mark Past Due UI uses mark_subscription_past_due_v1", () => {
    const hooks = read("src/hooks/billing/use-billing-lifecycle.ts");
    const dialog = read("src/components/billing/dialogs/billing-lifecycle-action-dialog.tsx");
    const page = read("src/pages/dashboard/billing/subscription-detail-page.tsx");
    assert.match(hooks, /mark_subscription_past_due_v1/);
    assert.match(hooks, /export function useMarkSubscriptionPastDue/);
    assert.match(dialog, /useMarkSubscriptionPastDue/);
    assert.match(page, /BillingLifecycleActionDialog/);
    assert.match(page, /setLifecycleDialogMode\("past_due"\)/);
    assert.match(page, /MARK_PAST_DUE_UI_STATUSES/);
  });

  it("Grace / renewal failure UI uses record_subscription_renewal_failure_v1", () => {
    const hooks = read("src/hooks/billing/use-billing-lifecycle.ts");
    const dialog = read("src/components/billing/dialogs/billing-lifecycle-action-dialog.tsx");
    const page = read("src/pages/dashboard/billing/subscription-detail-page.tsx");
    assert.match(hooks, /record_subscription_renewal_failure_v1/);
    assert.match(hooks, /export function useRecordSubscriptionRenewalFailure/);
    assert.match(dialog, /useRecordSubscriptionRenewalFailure/);
    assert.match(page, /setLifecycleDialogMode\("renewal_failure"\)/);
    assert.match(page, /RECORD_RENEWAL_FAILURE_UI_STATUSES/);
  });

  it("batch enforcement uses ONLY run_subscription_lifecycle_enforcement_v1", () => {
    const hooks = read("src/hooks/billing/use-billing-lifecycle.ts");
    const overview = read("src/pages/dashboard/billing/billing-overview-page.tsx");
    assert.match(hooks, /run_subscription_lifecycle_enforcement_v1/);
    assert.match(hooks, /export function useRunSubscriptionLifecycleEnforcement/);
    assert.match(overview, /useRunSubscriptionLifecycleEnforcement/);
    assert.match(overview, /Run Lifecycle Enforcement/);
    assert.doesNotMatch(overview, /enforce_trial_expirations_v1/);
    assert.doesNotMatch(overview, /enforce_active_period_due_v1/);
    assert.doesNotMatch(overview, /enforce_past_due_to_grace_v1/);
    assert.doesNotMatch(overview, /enforce_grace_period_expirations_v1/);
    assert.doesNotMatch(hooks, /enforce_trial_expirations_v1/);
    assert.doesNotMatch(hooks, /enforce_active_period_due_v1/);
    assert.doesNotMatch(hooks, /enforce_past_due_to_grace_v1/);
    assert.doesNotMatch(hooks, /enforce_grace_period_expirations_v1/);
  });

  it("UI does not directly mutate subscription.status", () => {
    const page = read("src/pages/dashboard/billing/subscription-detail-page.tsx");
    const dialog = read("src/components/billing/dialogs/billing-lifecycle-action-dialog.tsx");
    const overview = read("src/pages/dashboard/billing/billing-overview-page.tsx");
    const hooks = read("src/hooks/billing/use-billing-lifecycle.ts");
    // Reject client-side status writes (assignment), not equality checks (=== / !==).
    assert.doesNotMatch(page, /subscription\.status\s*=(?!=)/);
    assert.doesNotMatch(dialog, /status\s*=(?!=)/);
    assert.doesNotMatch(overview, /subscription\.status\s*=(?!=)/);
    assert.doesNotMatch(hooks, /\.update\(|status:\s*["']past_due|status:\s*["']grace_period/);
    assert.match(hooks, /invalidateQueries/);
  });

  it("individual enforce_* RPCs are not exposed as UI actions", () => {
    const loginAppSrc = [
      "src/pages/dashboard/billing/subscription-detail-page.tsx",
      "src/pages/dashboard/billing/billing-overview-page.tsx",
      "src/components/billing/dialogs/billing-lifecycle-action-dialog.tsx",
      "src/hooks/billing/use-billing-lifecycle.ts",
    ];
    for (const rel of loginAppSrc) {
      const src = read(rel);
      assert.doesNotMatch(src, /supabase\.rpc\(\s*["']enforce_/);
      assert.doesNotMatch(src, /["']enforce_trial_expirations_v1["']/);
      assert.doesNotMatch(src, /["']enforce_active_period_due_v1["']/);
      assert.doesNotMatch(src, /["']enforce_past_due_to_grace_v1["']/);
      assert.doesNotMatch(src, /["']enforce_grace_period_expirations_v1["']/);
    }
  });

  it("renewals queue links to billingDetailHref(companyId)", () => {
    const list = read("src/components/billing/platform/billing-platform-financial-list-page.tsx");
    const renewals = read("src/pages/dashboard/billing/billing-renewals-page.tsx");
    assert.match(renewals, /listType:\s*"renewals"/);
    assert.match(list, /billingDetailHref/);
    assert.match(list, /listType === "renewals"/);
    assert.doesNotMatch(renewals, /mark_subscription_past_due|record_subscription_renewal_failure|run_subscription_lifecycle/);
  });

  it("expirations queue links to billingDetailHref(companyId)", () => {
    const list = read("src/components/billing/platform/billing-platform-financial-list-page.tsx");
    const expirations = read("src/pages/dashboard/billing/billing-expirations-page.tsx");
    assert.match(expirations, /listType:\s*"expirations"/);
    assert.match(list, /listType === "expirations"/);
    assert.match(list, /billingDetailHref\(companyId\)/);
    assert.doesNotMatch(expirations, /mark_subscription_past_due|record_subscription_renewal_failure|run_subscription_lifecycle/);
  });

  it("payment renewal path remains separate (renew_subscription_from_payment)", () => {
    const paymentHook = read("src/hooks/billing/use-record-subscription-payment.ts");
    const lifecycle = read("src/hooks/billing/use-billing-lifecycle.ts");
    const page = read("src/pages/dashboard/billing/subscription-detail-page.tsx");
    assert.match(paymentHook, /renew_subscription_from_payment/);
    assert.doesNotMatch(lifecycle, /renew_subscription_from_payment/);
    assert.match(page, /useRecordSubscriptionPayment/);
    assert.match(page, /BillingRecordPaymentDialog/);
    assert.match(page, /BillingLifecycleActionDialog/);
  });

  it("clamps enforcement limit to safe bounds", () => {
    assert.equal(clampLifecycleEnforcementLimit(100), 100);
    assert.equal(clampLifecycleEnforcementLimit(0), 1);
    assert.equal(clampLifecycleEnforcementLimit(9999), LIFECYCLE_ENFORCEMENT_MAX_LIMIT);
    assert.equal(clampLifecycleEnforcementLimit(Number.NaN), LIFECYCLE_ENFORCEMENT_DEFAULT_LIMIT);
  });

  it("summarizes orchestrator JSON without inventing payment renewal", () => {
    const rows = summarizeLifecycleEnforcementResult({
      ok: true,
      limit: 100,
      trials: { processed_count: 1, skipped_count: 0 },
      active_period_due: { processed_count: 2 },
      past_due_to_grace: { processed_count: 3 },
      grace_expirations: { expired_count: 4 },
      renewal: { automatic_paid_renewal: false, authoritative_rpc: "renew_subscription_from_payment" },
    });
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    assert.equal(byKey.processed, 10);
    assert.equal(byKey.trials, 1);
    assert.equal(byKey.active_past_due, 2);
    assert.equal(byKey.past_due_grace, 3);
    assert.equal(byKey.grace_expired, 4);
    assert.match(String(byKey.no_auto_renewal), /Not performed/);
  });
});
