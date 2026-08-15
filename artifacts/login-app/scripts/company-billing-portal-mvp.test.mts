/**
 * Phase 8A — Company Billing Portal MVP (Company Workspace Plan & billing tab).
 * Run: npx --yes tsx --test scripts/company-billing-portal-mvp.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Phase 8A company billing portal MVP", () => {
  const tab = read("src/components/company-workspace/tabs/company-subscription-tab.tsx");
  const en = read("src/locales/en/common.json");
  const ar = read("src/locales/ar/common.json");

  it("renders package/status/cycle via overview fields", () => {
    assert.match(tab, /companyWorkspace\.overview\.currentPlan/);
    assert.match(tab, /billing\.tables\.status/);
    assert.match(tab, /billing\.detail\.cycle/);
    assert.match(tab, /translateBillingCycle/);
    assert.match(tab, /SubscriptionStatusBadge/);
    assert.match(tab, /useWorkspaceBillingSummary/);
  });

  it("displays price + currency when available", () => {
    assert.match(tab, /listPriceLabel/);
    assert.match(tab, /formatBillingCurrency/);
    assert.match(tab, /companyWorkspace\.subscription\.price/);
    assert.match(tab, /companyWorkspace\.subscription\.currency/);
    assert.match(tab, /data\?\.currency/);
  });

  it("shows trial information when applicable", () => {
    assert.match(tab, /isTrialing/);
    assert.match(tab, /trial_ends_at/);
    assert.match(tab, /companyWorkspace\.subscription\.trialStatus/);
    assert.match(tab, /companyWorkspace\.subscription\.trialEnds/);
  });

  it("shows renewal/period/grace dates when available", () => {
    assert.match(tab, /current_period_start/);
    assert.match(tab, /current_period_end/);
    assert.match(tab, /next_renewal_at/);
    assert.match(tab, /grace_period_ends_at/);
    assert.match(tab, /companyWorkspace\.subscription\.periodStart/);
    assert.match(tab, /companyWorkspace\.subscription\.graceEnds/);
  });

  it("features remain read-only for company users", () => {
    assert.match(tab, /PlanFeaturesPanel/);
    assert.match(tab, /canManageCommercial=\{false\}/);
    assert.doesNotMatch(tab, /BillingGrantCommercialFeatureDialog/);
    assert.doesNotMatch(tab, /BillingRevokeFeatureGrantDialog/);
    assert.doesNotMatch(tab, /useSetCompanyFeatureGrant/);
    assert.doesNotMatch(tab, /useRevokeCompanyFeatureGrant/);
  });

  it("invoices/payments/receipts use authenticated company only", () => {
    assert.match(tab, /useAuth/);
    assert.match(tab, /company\?\.id/);
    assert.match(tab, /InvoiceHistoryPanel companyId=\{companyId\}/);
    assert.match(tab, /PaymentHistoryPanel companyId=\{companyId\}/);
    assert.match(tab, /ReceiptHistoryPanel companyId=\{companyId\}/);
    assert.doesNotMatch(tab, /useSearch|useParams|useRoute|searchParams|companyIdFromUrl/);
    assert.doesNotMatch(tab, /p_company_id/);
  });

  it("does not accept arbitrary company_id from URL/query", () => {
    assert.doesNotMatch(tab, /URLSearchParams/);
    assert.doesNotMatch(tab, /location\.search/);
    assert.doesNotMatch(tab, /params\.companyId/);
    assert.match(tab, /Tenant isolation/);
    assert.match(tab, /tenantAligned/);
  });

  it("platform billing actions are NOT exposed", () => {
    const banned = [
      "BillingChangePackageDialog",
      "BillingAssignPlanDialog",
      "BillingConvertTrialDialog",
      "BillingLifecycleActionDialog",
      "useMarkSubscriptionPastDue",
      "useRunSubscriptionLifecycleEnforcement",
      "change_company_package_v1",
      "assign_subscription_plan",
      "convert_trial_to_paid_v1",
      "run_subscription_lifecycle_enforcement_v1",
      "suspend_billing_subscription",
      "BillingRecordPaymentDialog",
    ];
    for (const token of banned) {
      assert.doesNotMatch(tab, new RegExp(token));
    }
  });

  it("empty and error states are present", () => {
    assert.match(tab, /workspace\.billing\.noSubscription/);
    assert.match(tab, /companyWorkspace\.subscription\.loadError/);
    assert.match(tab, /companyWorkspace\.subscription\.tenantMismatch/);
    assert.match(tab, /common\.loading/);
    assert.match(tab, /billingNotAvailable/);
  });

  it("EN/AR localization exists for new portal strings", () => {
    const keys = [
      "overviewSection",
      "featuresSection",
      "featuresReadOnlyHint",
      "invoicesSection",
      "paymentsSection",
      "receiptsSection",
      "price",
      "currency",
      "trialStatus",
      "trialEnds",
      "periodStart",
      "graceEnds",
      "pastDueHint",
      "loadError",
      "tenantMismatch",
    ];
    for (const key of keys) {
      assert.match(en, new RegExp(`"${key}"\\s*:`));
      assert.match(ar, new RegExp(`"${key}"\\s*:`));
    }
  });

  it("does not revive /workspace/billing as competing portal", () => {
    const layout = read("src/components/workspace/layout/workspace-layout.tsx");
    assert.match(layout, /Redirect/);
    assert.match(layout, /companyWorkspaceHref\("subscription"\)/);
    assert.doesNotMatch(tab, /workspace\/billing/);
  });
});
