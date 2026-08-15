/**
 * Subscription Detail production hardening regression tests.
 * Run: npm run test:subscription-detail
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateCompanyProvisioning } from "../src/lib/billing/company-provisioning";
import { isMissingBillingPaymentOptionsRpcError } from "../src/lib/billing/settings-runtime";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

console.log("\nSubscription Detail hardening regression tests\n");

assert.equal(
  isMissingBillingPaymentOptionsRpcError(
    'Could not find the function public.get_billing_payment_options_v1(p_company_id) in the schema cache',
  ),
  true,
);
console.log("  ✓ payment options RPC missing detection");

const auditRpc = readFileSync(join(root, "src/lib/billing/list-billing-audit-rpc.ts"), "utf8");
assert.match(auditRpc, /p_company_id/);
assert.doesNotMatch(auditRpc, /legacyData/);
assert.doesNotMatch(auditRpc, /degradedMessage/);
console.log("  ✓ audit RPC fail-fast (no legacy fallback)");

const detailPage = readFileSync(
  join(root, "src/pages/dashboard/billing/subscription-detail-page.tsx"),
  "utf8",
);
assert.match(detailPage, /canViewBillingAudit/);
assert.match(detailPage, /useCompanyProvisioning/);
assert.match(detailPage, /CompanyProvisioningGate/);
assert.match(detailPage, /mutationsAllowed/);
assert.match(detailPage, /canViewAudit \? <TabsTrigger value="audit"/);
console.log("  ✓ audit tab RBAC gate + provisioning gate + mutation lock");

// Phase 7.9A — single package-change path for existing subscriptions
assert.match(detailPage, /BillingChangePackageDialog/);
assert.match(detailPage, /change_company_package_v1|useChangeCompanyPackage|changePackage/);
assert.match(detailPage, /canChangePackage/);
assert.match(detailPage, /canAssignInitialPackage/);
assert.match(detailPage, /!subscription\.plan_id/);
assert.doesNotMatch(detailPage, /billing\.edit\.assignPlan(?!Initial)/);
assert.doesNotMatch(detailPage, /UpgradePlanCta/);
assert.doesNotMatch(detailPage, /canChangePlan=\{canEdit\}/);
assert.doesNotMatch(detailPage, /onPlanChanged=/);
console.log("  ✓ Phase 7.9A: Change Package is sole existing-package path; Assign only when !plan_id");

const planExperience = readFileSync(
  join(root, "src/components/billing/panels/plan-experience-panel.tsx"),
  "utf8",
);
assert.match(planExperience, /onChangePackage/);
assert.match(planExperience, /billing\.edit\.changePackage/);
assert.doesNotMatch(planExperience, /import\s*\{[^}]*UpgradePlanCta/);
assert.doesNotMatch(planExperience, /useAssignSubscriptionPlan/);
assert.doesNotMatch(planExperience, /supabase\.rpc\(\s*["']assign_subscription_plan/);
console.log("  ✓ PlanExperiencePanel uses Change Package only (no Upgrade CTA)");

const changeDialog = readFileSync(
  join(root, "src/components/billing/dialogs/billing-change-package-dialog.tsx"),
  "utf8",
);
assert.match(changeDialog, /useChangeCompanyPackage/);
assert.match(changeDialog, /cycleReadOnly|unchanged/);
assert.doesNotMatch(changeDialog, /useAssignSubscriptionPlan/);
const billingEditHooks = readFileSync(join(root, "src/hooks/billing/use-billing-edit.ts"), "utf8");
assert.match(billingEditHooks, /change_company_package_v1/);
console.log("  ✓ Change Package dialog → change_company_package_v1; cycle read-only");

const upgradeCta = readFileSync(
  join(root, "src/components/billing/panels/upgrade-plan-cta.tsx"),
  "utf8",
);
assert.match(upgradeCta, /@deprecated|Phase 7\.9A/);
assert.doesNotMatch(upgradeCta, /useAssignSubscriptionPlan/);
assert.doesNotMatch(upgradeCta, /supabase\.rpc/);
assert.doesNotMatch(upgradeCta, /mutateAsync/);
console.log("  ✓ UpgradePlanCta stubbed; no package mutation");

const assignDialog = readFileSync(
  join(root, "src/components/billing/dialogs/billing-assign-plan-dialog.tsx"),
  "utf8",
);
assert.match(assignDialog, /Initial package assignment only/);
assert.match(assignDialog, /useAssignSubscriptionPlan/);
console.log("  ✓ Assign dialog retained for initial assignment only");


const billingLayout = readFileSync(join(root, "src/components/billing/layout/billing-layout.tsx"), "utf8");
assert.match(billingLayout, /BillingHealthProvider/);
assert.match(billingLayout, /BillingHealthGate/);
console.log("  ✓ billing health check at billing module startup");

const usagePanel = readFileSync(join(root, "src/components/billing/panels/usage-summary-panel.tsx"), "utf8");
assert.match(usagePanel, /usageNoneRecorded/);
assert.match(usagePanel, /hasRecordedUsage/);
console.log("  ✓ usage summary zero-state");

const timelinePanel = readFileSync(
  join(root, "src/components/billing/panels/subscription-timeline-panel.tsx"),
  "utf8",
);
assert.match(timelinePanel, /buildOnboardingTimeline/);
assert.match(timelinePanel, /timelineCompanyCreated/);
console.log("  ✓ timeline onboarding fallback");

const notificationsPanel = readFileSync(
  join(root, "src/components/billing/panels/subscription-notifications-panel.tsx"),
  "utf8",
);
assert.match(notificationsPanel, /notificationsWelcome/);
console.log("  ✓ notifications welcome empty state");

const ready = evaluateCompanyProvisioning({
  companyExists: true,
  subscription: {
    id: "sub-1",
    company_id: "co-1",
    plan_id: "plan-1",
    status: "active",
    billing_cycle: "monthly",
    current_period_start: null,
    current_period_end: null,
    next_renewal_at: null,
    trial_ends_at: null,
    grace_period_ends_at: null,
    auto_renewal: true,
    payment_method_label: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    plan: {
      id: "plan-1",
      name: "Pro",
      display_name: "Pro",
      code: "pro",
      tier_rank: 2,
      price_monthly: 99,
      price_yearly: 999,
      max_users: 10,
      max_customers: 100,
      storage_gb: 10,
      ai_tokens_monthly: 1000,
      features: {},
    },
  },
  billingContact: {
    id: "bc-1",
    company_id: "co-1",
    name: "Billing",
    email: "billing@example.com",
    phone: null,
    is_active: true,
  },
});
assert.equal(ready.ready, true);

const missingContact = evaluateCompanyProvisioning({
  companyExists: true,
  subscription: ready.ready ? ({} as never) : null,
  billingContact: null,
});
assert.ok(missingContact.issues.includes("subscription_missing") || missingContact.issues.includes("billing_contact_missing"));
console.log("  ✓ company provisioning evaluation");

const en = JSON.parse(readFileSync(join(root, "src/locales/en/common.json"), "utf8"));
const ar = JSON.parse(readFileSync(join(root, "src/locales/ar/common.json"), "utf8"));
for (const key of ["health", "provisioning"]) {
  assert.ok(en.billing[key]?.title, `en billing.${key}`);
  assert.ok(ar.billing[key]?.title, `ar billing.${key}`);
  assert.match(ar.billing[key].title, /[\u0600-\u06FF]/);
}
assert.ok(en.billing.detail.emptyStates.usageNoneRecorded);
assert.match(ar.billing.detail.emptyStates.usageNoneRecorded, /[\u0600-\u06FF]/);
console.log("  ✓ hardening i18n keys (en + ar)");

console.log("\n✓ Subscription Detail hardening regression tests passed.\n");
