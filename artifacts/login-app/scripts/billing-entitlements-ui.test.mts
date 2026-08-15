/**
 * Phase 7.9C — subscription entitlements management UI.
 * Run: npx --yes tsx --test scripts/billing-entitlements-ui.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  BILLING_COMMERCIAL_GRANT_SOURCES,
  canDirectRevokeEntitlementSource,
  isCommercialEntitlement,
  isGrantableCommercialEntitlement,
  isManagedEntitlementSource,
} from "../src/lib/billing/entitlement-display.ts";
import type { CompanyEntitlement } from "../src/lib/billing/types.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function entitlement(partial: Partial<CompanyEntitlement> & Pick<CompanyEntitlement, "feature_code" | "label" | "enabled" | "source">): CompanyEntitlement {
  return {
    limit_value: {},
    ...partial,
  };
}

describe("Phase 7.9C billing entitlements UI", () => {
  it("entitlements panel displays real commercial sources", () => {
    const panel = read("src/components/billing/panels/plan-features-panel.tsx");
    const en = read("src/locales/en/common.json");
    for (const source of ["package", "trial", "manual", "contract", "system"]) {
      assert.match(en, new RegExp(`"${source}"\\s*:`));
    }
    assert.match(panel, /billing\.detail\.featureSources/);
    assert.doesNotMatch(panel, /override → plan → default/);
    assert.match(en, /package, trial, manual, contract, system/);
  });

  it("feature code, commercial/core, starts/expires are displayed", () => {
    const panel = read("src/components/billing/panels/plan-features-panel.tsx");
    assert.match(panel, /item\.feature_code/);
    assert.match(panel, /isCommercialEntitlement/);
    assert.match(panel, /billing\.entitlements\.commercial/);
    assert.match(panel, /billing\.entitlements\.core/);
    assert.match(panel, /item\.starts_at/);
    assert.match(panel, /item\.expires_at/);
    assert.match(panel, /formatBillingDate/);
  });

  it("grant UI only offers commercial features and manual/contract sources", () => {
    const dialog = read("src/components/billing/dialogs/billing-grant-commercial-feature-dialog.tsx");
    const helpers = read("src/lib/billing/entitlement-display.ts");
    assert.match(dialog, /isGrantableCommercialEntitlement/);
    assert.match(dialog, /BILLING_COMMERCIAL_GRANT_SOURCES/);
    assert.deepEqual([...BILLING_COMMERCIAL_GRANT_SOURCES], ["manual", "contract"]);
    assert.match(helpers, /isCommercialEntitlement/);
    assert.doesNotMatch(dialog, /value=["']trial["']/);
    assert.doesNotMatch(dialog, /value=["']package["']/);
    assert.doesNotMatch(dialog, /value=["']system["']/);
  });

  it("trial is not exposed as a generic manual grant source", () => {
    const dialog = read("src/components/billing/dialogs/billing-grant-commercial-feature-dialog.tsx");
    assert.doesNotMatch(dialog, /"trial"/);
    assert.match(dialog, /manual/);
    assert.match(dialog, /contract/);
  });

  it("package/system/trial grants cannot be blindly revoked", () => {
    const panel = read("src/components/billing/panels/plan-features-panel.tsx");
    const helpers = read("src/lib/billing/entitlement-display.ts");
    assert.match(panel, /isManagedEntitlementSource/);
    assert.match(panel, /revokeManagedBlocked/);
    assert.match(helpers, /MANAGED_ENTITLEMENT_SOURCES/);
    assert.equal(canDirectRevokeEntitlementSource("package"), false);
    assert.equal(canDirectRevokeEntitlementSource("trial"), false);
    assert.equal(canDirectRevokeEntitlementSource("system"), false);
    assert.equal(isManagedEntitlementSource("package"), true);
  });

  it("manual and contract grants can be revoked with confirmation", () => {
    const panel = read("src/components/billing/panels/plan-features-panel.tsx");
    const revoke = read("src/components/billing/dialogs/billing-revoke-feature-grant-dialog.tsx");
    assert.match(panel, /BillingRevokeFeatureGrantDialog/);
    assert.match(panel, /canDirectRevokeEntitlementSource/);
    assert.match(revoke, /revokeTitle/);
    assert.match(revoke, /entitlement\.label/);
    assert.match(revoke, /entitlement\.source|source/);
    assert.match(revoke, /expires_at/);
    assert.equal(canDirectRevokeEntitlementSource("manual"), true);
    assert.equal(canDirectRevokeEntitlementSource("contract"), true);
  });

  it("grant uses useSetCompanyFeatureGrant; revoke uses useRevokeCompanyFeatureGrant", () => {
    const grant = read("src/components/billing/dialogs/billing-grant-commercial-feature-dialog.tsx");
    const revoke = read("src/components/billing/dialogs/billing-revoke-feature-grant-dialog.tsx");
    assert.match(grant, /useSetCompanyFeatureGrant/);
    assert.match(revoke, /useRevokeCompanyFeatureGrant/);
    assert.doesNotMatch(grant, /supabase\.rpc/);
    assert.doesNotMatch(revoke, /supabase\.rpc/);
    assert.doesNotMatch(grant, /from\("@\/lib\/supabase"\)/);
    assert.doesNotMatch(revoke, /from\("@\/lib\/supabase"\)/);
  });

  it("UI uses existing commercial invalidation via approval hooks", () => {
    const hooks = read("src/hooks/companies/use-company-approval.ts");
    assert.match(hooks, /invalidateCommercialQueries/);
    assert.match(hooks, /queryKey:\s*\["billing"\]/);
    assert.match(hooks, /useSetCompanyFeatureGrant/);
    assert.match(hooks, /useRevokeCompanyFeatureGrant/);
  });

  it("authorization uses canManageCompanyCommercialAccess, not canEditBilling alone", () => {
    const page = read("src/pages/dashboard/billing/subscription-detail-page.tsx");
    const panel = read("src/components/billing/panels/plan-features-panel.tsx");
    assert.match(page, /canManageCompanyCommercialAccess/);
    assert.match(page, /canManageCommercial/);
    assert.match(panel, /canManageCommercial/);
    assert.doesNotMatch(panel, /canEditBilling/);
  });

  it("helper rules: commercial-only grantable; core excluded", () => {
    const core = entitlement({
      feature_code: "core_crm",
      label: "Core CRM",
      enabled: true,
      source: "default",
      is_commercial: false,
    });
    const customers = entitlement({
      feature_code: "customers",
      label: "Customers",
      enabled: true,
      source: "default",
      is_commercial: false,
    });
    const commercialNone = entitlement({
      feature_code: "ai_assistant",
      label: "AI",
      enabled: false,
      source: "none",
      is_commercial: true,
    });
    const packageRow = entitlement({
      feature_code: "whatsapp_channel",
      label: "WhatsApp",
      enabled: true,
      source: "package",
      is_commercial: true,
    });
    assert.equal(isCommercialEntitlement(core), false);
    assert.equal(isGrantableCommercialEntitlement(core), false);
    assert.equal(isGrantableCommercialEntitlement(customers), false);
    assert.equal(isGrantableCommercialEntitlement(commercialNone), true);
    assert.equal(isGrantableCommercialEntitlement(packageRow), false);
  });

  it("Companies entitlement dialog still uses the shared hooks/service model", () => {
    const companies = read("src/components/companies/company-features-access-dialog.tsx");
    assert.match(companies, /useSetCompanyFeatureGrant/);
    assert.match(companies, /useRevokeCompanyFeatureGrant/);
    assert.match(companies, /useCompanyEntitlements/);
    assert.doesNotMatch(companies, /supabase\.rpc\(\s*["']set_company_feature_grant/);
  });

  it("subscription detail package/lifecycle actions remain present", () => {
    const page = read("src/pages/dashboard/billing/subscription-detail-page.tsx");
    assert.match(page, /BillingChangePackageDialog/);
    assert.match(page, /BillingLifecycleActionDialog/);
    assert.match(page, /BillingRecordPaymentDialog/);
    assert.match(page, /canManageCommercial=\{canManageCommercial\}/);
  });
});
