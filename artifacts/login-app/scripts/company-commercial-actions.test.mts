/**
 * Companies row commercial actions: features, subscription, change package.
 * Run: npx tsx --tsconfig tsconfig.json scripts/company-commercial-actions.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Company } from "../src/lib/types.ts";
import type { CompanyEntitlement } from "../src/lib/billing/types.ts";
import {
  companyRowActionRequiresConfirm,
  visibleCompanyRowActions,
  type CompanyRowActionCapabilities,
} from "../src/lib/companies/company-row-actions.ts";
import {
  canDirectRevokeEntitlementSource,
  isCommercialEntitlement,
  isGrantableCommercialEntitlement,
  isManagedEntitlementSource,
} from "../src/lib/billing/entitlement-display.ts";
import { sanitizeCompanyCommercialError } from "../src/lib/companies/company-lifecycle-errors.ts";
import { resolveCompanySubscriptionActionGate } from "../src/lib/companies/company-subscription-action-gate.ts";
import type { CompanySubscription } from "../src/lib/billing/types.ts";

const here = dirname(fileURLToPath(import.meta.url));

function company(overrides: Partial<Company> = {}): Company {
  return {
    id: "c1",
    name: "Acme",
    status: "Active",
    approval_status: "approved",
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-10T00:00:00.000Z",
    ...overrides,
  } as Company;
}

function entitlement(overrides: Partial<CompanyEntitlement> = {}): CompanyEntitlement {
  return {
    feature_code: "leads",
    label: "Leads",
    enabled: true,
    source: "none",
    limit_value: {},
    is_commercial: true,
    ...overrides,
  };
}

const adminCaps: CompanyRowActionCapabilities = {
  canView: true,
  canEdit: true,
  canDelete: true,
  canCommercial: true,
  canViewBilling: true,
  canEditBilling: true,
};

const tenantCaps: CompanyRowActionCapabilities = {
  canView: true,
  canEdit: true,
  canDelete: false,
  canCommercial: false,
  canViewBilling: true,
  canEditBilling: true,
};

const ids = (row: Company, caps = adminCaps) => visibleCompanyRowActions(row, caps).map((item) => item.id);

console.log("\nCompany commercial row actions\n");

assert.deepEqual(
  ids(company({ approval_status: "pending", status: "Trial" })).filter((id) =>
    ["features", "subscription", "changePackage", "convertTrial"].includes(id),
  ),
  [],
);
assert.ok(ids(company({ status: "Trial" })).includes("features"));
assert.ok(ids(company({ status: "Trial" })).includes("subscription"));
assert.ok(ids(company({ status: "Trial" })).includes("convertTrial"));
assert.ok(!ids(company({ status: "Trial" })).includes("changePackage"));
assert.ok(ids(company()).includes("features"));
assert.ok(ids(company()).includes("subscription"));
assert.ok(ids(company()).includes("changePackage"));
assert.ok(!ids(company()).includes("convertTrial"));
assert.ok(ids(company({ status: "Suspended" })).includes("features"));
assert.ok(ids(company({ status: "Suspended" })).includes("subscription"));
assert.ok(!ids(company({ status: "Suspended" })).includes("changePackage"));
assert.ok(
  !ids(company({ approval_status: "rejected", status: "Trial" })).includes("features"),
);
assert.ok(!ids(company(), tenantCaps).includes("features"));
assert.ok(ids(company(), tenantCaps).includes("subscription"));
assert.ok(ids(company(), tenantCaps).includes("changePackage"));
assert.equal(companyRowActionRequiresConfirm("changePackage"), true);
assert.equal(companyRowActionRequiresConfirm("convertTrial"), true);
assert.equal(companyRowActionRequiresConfirm("features"), false);
console.log("  ✓ visibility matrix for features / subscription / change package");

assert.equal(isCommercialEntitlement(entitlement({ is_commercial: false })), false);
assert.equal(isGrantableCommercialEntitlement(entitlement({ source: "package" })), false);
assert.equal(isGrantableCommercialEntitlement(entitlement({ source: "trial" })), false);
assert.equal(isGrantableCommercialEntitlement(entitlement({ source: "system" })), false);
assert.equal(isGrantableCommercialEntitlement(entitlement({ source: "none" })), true);
assert.equal(isGrantableCommercialEntitlement(entitlement({ source: "manual", enabled: false })), true);
assert.equal(canDirectRevokeEntitlementSource("manual"), true);
assert.equal(canDirectRevokeEntitlementSource("contract"), true);
assert.equal(canDirectRevokeEntitlementSource("package"), false);
assert.equal(isManagedEntitlementSource("package"), true);
assert.equal(isManagedEntitlementSource("manual"), false);
console.log("  ✓ grant/revoke only for commercial manual/contract; package/trial/system preserved");

assert.equal(
  sanitizeCompanyCommercialError(new Error("permission denied for rpc get_company_entitlements"), "fallback"),
  "fallback",
);
assert.equal(sanitizeCompanyCommercialError(new Error("cannot change package while trialing"), "fallback"), "fallback");
assert.equal(sanitizeCompanyCommercialError(new Error("sqlstate 42501"), "fallback"), "fallback");
console.log("  ✓ commercial errors are sanitized");

const pages = readFileSync(join(here, "../src/pages/companies.tsx"), "utf8");
const featuresDialog = readFileSync(join(here, "../src/components/companies/company-features-access-dialog.tsx"), "utf8");
const subscriptionDialog = readFileSync(join(here, "../src/components/companies/company-subscription-manage-dialog.tsx"), "utf8");
const changeDialog = readFileSync(join(here, "../src/components/billing/dialogs/billing-change-package-dialog.tsx"), "utf8");
const billingEdit = readFileSync(join(here, "../src/hooks/billing/use-billing-edit.ts"), "utf8");
const entitlementService = readFileSync(join(here, "../src/lib/billing/company-feature-entitlement-service.ts"), "utf8");
const ar = JSON.parse(readFileSync(join(here, "../src/locales/ar/common.json"), "utf8"));

assert.match(pages, /CompanyFeaturesAccessDialog/);
assert.match(pages, /CompanySubscriptionManageDialog/);
assert.match(pages, /BillingChangePackageDialog/);
assert.match(pages, /case "features"/);
assert.match(pages, /case "subscription"/);
assert.match(pages, /case "changePackage"/);
assert.match(featuresDialog, /useSetCompanyFeatureGrant/);
assert.match(featuresDialog, /useRevokeCompanyFeatureGrant/);
assert.match(featuresDialog, /isGrantableCommercialEntitlement/);
assert.match(featuresDialog, /canDirectRevokeEntitlementSource/);
assert.doesNotMatch(featuresDialog, /users\.edit|companies\.edit|billing\.edit/);
assert.match(subscriptionDialog, /useCompanySubscription/);
assert.match(changeDialog, /useChangeCompanyPackage/);
assert.match(changeDialog, /translatePlanName/);
assert.doesNotMatch(changeDialog, /\$\{row\.label\} \(\$\{code\}\)/);
assert.match(billingEdit, /change_company_package_v1/);
assert.match(billingEdit, /convert_trial_to_paid_v1/);
assert.match(entitlementService, /get_company_entitlements/);
assert.match(entitlementService, /set_company_feature_grant/);
assert.match(entitlementService, /revoke_company_feature_grant/);
assert.equal(ar.companies.actions.features, "إدارة الميزات والصلاحيات التجارية");
assert.equal(ar.companies.actions.subscription, "إدارة الباقات والاشتراك");
assert.equal(ar.companies.actions.changePackage, "تغيير الباقة");
assert.equal(ar.companies.commercial.packageNames.basic, "الأساسية");
assert.equal(ar.companies.commercial.packageNames.pro, "الاحترافية");
assert.equal(ar.companies.features.grantSource.package, "باقة");
assert.equal(ar.companies.features.grantSource.manual, "يدوي");
assert.equal(ar.companies.features.grantSource.contract, "تعاقدي");
assert.equal(ar.companies.features.grantSource.system, "نظامي");
assert.equal(ar.companies.features.grantSource.trial, "تجريبي");
console.log("  ✓ companies page wires existing commercial RPCs; Arabic labels present");

assert.match(subscriptionDialog, /resolveCompanySubscriptionActionGate/);
assert.doesNotMatch(subscriptionDialog, /if \(error \|\| !data\) \{\s*onBlocked\("load"\)/);
assert.equal(
  resolveCompanySubscriptionActionGate({
    mode: "changePackage",
    isLoading: false,
    error: null,
    data: null,
  }).kind,
  "missing",
);
assert.equal(
  resolveCompanySubscriptionActionGate({
    mode: "changePackage",
    isLoading: false,
    error: new Error("relation does not exist"),
    data: null,
  }).kind,
  "load",
);
assert.equal(
  resolveCompanySubscriptionActionGate({
    mode: "changePackage",
    isLoading: false,
    error: null,
    data: { status: "trialing" } as CompanySubscription,
  }).kind,
  "trial",
);
assert.equal(
  resolveCompanySubscriptionActionGate({
    mode: "changePackage",
    isLoading: false,
    error: null,
    data: { status: "active", plan_id: null } as CompanySubscription,
  }).kind,
  "ready",
);
assert.match(pages, /reason === "missing"/);
assert.match(pages, /setSubscriptionCompany\(company\)/);
assert.match(pages, /setConvertCompany\(company\)/);
assert.equal(ar.companies.commercial.noSubscription, "لا يوجد اشتراك لهذه الشركة.");
assert.equal(ar.companies.commercial.operationFailed, "تعذر تنفيذ العملية، يرجى المحاولة مرة أخرى.");
console.log("  ✓ missing company_subscriptions row is not treated as a load failure");
console.log("\nCompany commercial actions tests passed.\n");
