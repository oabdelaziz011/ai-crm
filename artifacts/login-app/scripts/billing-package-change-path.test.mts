/**
 * Phase 7.9A — unify package-change UI paths.
 * Run: npx --yes tsx --test scripts/billing-package-change-path.test.mts
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

describe("Phase 7.9A package-change UI path", () => {
  it("subscription detail uses a single Change Package path for existing packages", () => {
    const page = read("src/pages/dashboard/billing/subscription-detail-page.tsx");
    assert.match(page, /BillingChangePackageDialog/);
    assert.match(page, /canChangePackage/);
    assert.match(page, /canAssignInitialPackage/);
    assert.match(page, /!subscription\.plan_id/);
    // Competing "Assign Plan" for existing packages removed
    assert.doesNotMatch(page, /billing\.edit\.assignPlan"/);
    assert.doesNotMatch(page, /UpgradePlanCta/);
    // Assign dialog only when initial
    assert.match(page, /canAssignInitialPackage \? \([\s\S]*BillingAssignPlanDialog/);
  });

  it("Change Package dialog calls change_company_package_v1 and keeps cycle read-only", () => {
    const dialog = read("src/components/billing/dialogs/billing-change-package-dialog.tsx");
    const hooks = read("src/hooks/billing/use-billing-edit.ts");
    assert.match(dialog, /useChangeCompanyPackage/);
    assert.match(hooks, /change_company_package_v1/);
    assert.match(dialog, /unchanged|cycleReadOnly/);
    assert.doesNotMatch(dialog, /assign_subscription_plan/);
    assert.doesNotMatch(dialog, /useAssignSubscriptionPlan/);
  });

  it("useChangeCompanyPackage is the paid change mutation; assign is documented as bootstrap-only", () => {
    const hooks = read("src/hooks/billing/use-billing-edit.ts");
    assert.match(hooks, /export function useChangeCompanyPackage/);
    assert.match(hooks, /change_company_package_v1/);
    assert.match(hooks, /Initial \/ bootstrap package assignment only/);
    assert.match(hooks, /export function useAssignSubscriptionPlan/);
    assert.match(hooks, /assign_subscription_plan/);
  });

  it("PlanExperiencePanel does not render UpgradePlanCta or assign_subscription_plan", () => {
    const panel = read("src/components/billing/panels/plan-experience-panel.tsx");
    assert.doesNotMatch(panel, /import\s*\{[^}]*UpgradePlanCta/);
    assert.doesNotMatch(panel, /useAssignSubscriptionPlan/);
    assert.doesNotMatch(panel, /supabase\.rpc\(\s*["']assign_subscription_plan/);
    assert.match(panel, /billing\.edit\.changePackage/);
    assert.match(panel, /onChangePackage/);
  });

  it("UpgradePlanCta stub has no package mutation", () => {
    const cta = read("src/components/billing/panels/upgrade-plan-cta.tsx");
    assert.doesNotMatch(cta, /useAssignSubscriptionPlan/);
    assert.doesNotMatch(cta, /supabase\.rpc/);
    assert.doesNotMatch(cta, /mutateAsync/);
    assert.match(cta, /return null/);
  });
});
