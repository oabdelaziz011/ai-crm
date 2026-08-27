/**
 * Guard: company commercial terms extend existing billing — no duplicate stacks,
 * no Parts 1–4 rewrite, no catalog price mutation.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const migration = readFileSync(join(root, "supabase/migrations/303_company_commercial_terms.sql"), "utf8");
const dialog = readFileSync(
  join(root, "artifacts/login-app/src/components/companies/company-approval-review-dialog.tsx"),
  "utf8",
);
const workspace = readFileSync(
  join(root, "artifacts/login-app/src/components/companies/approval/company-approval-workspace.tsx"),
  "utf8",
);

assert.match(migration, /company_commercial_terms/);
assert.match(migration, /company_usage_limit_overrides/);
assert.match(migration, /upsert_company_commercial_terms_v1/);
assert.match(migration, /is_super_admin\(\)/);
assert.match(migration, /resolve_company_payable_amount/);
assert.match(migration, /online_checkout_allowed/);
assert.doesNotMatch(migration, /drop table public\.plans/i);
assert.doesNotMatch(migration, /update public\.plans[\s\S]*price_monthly/);
assert.match(dialog, /max-w-\[1600px\]/);
assert.match(workspace, /useSetCompanyFeatureGrant/);
assert.match(workspace, /useCompanyCurrentPeriodUsage/);
assert.doesNotMatch(workspace, /useCompanyUsageSnapshot/);
assert.match(workspace, /shouldAssignPackageDuringReview|resolveReviewSelectedPlanId/);
assert.match(workspace, /change_company_package_v1|useChangeCompanyPackage|assignPlan/);
assert.match(workspace, /checkoutLimitation/);
assert.match(workspace, /checkoutUsesCompanyPrice/);
assert.match(workspace, /reject_company_v1|useRejectCompany/);
assert.match(workspace, /AlertDialog/);
assert.match(workspace, /openRejectConfirmation/);
assert.match(workspace, /CompanyApprovalAdminAccessPanel/);
assert.match(workspace, /canDirectRevokeEntitlementSource|isGrantableCommercialEntitlement/);
assert.match(workspace, /isEntitlementConfiguredOn/);
assert.match(workspace, /packageIncludedTitle/);
const adminPanelSrc = readFileSync(
  join(root, "artifacts/login-app/src/components/companies/approval/company-approval-admin-access-panel.tsx"),
  "utf8",
);
assert.match(adminPanelSrc, /scrollMode=["']parent["']/);
assert.doesNotMatch(adminPanelSrc, /className="[^"]*max-h-\[22rem\][^"]*overflow-hidden/);

const migration304 = readFileSync(join(root, "supabase/migrations/304_company_payable_checkout.sql"), "utf8");
assert.match(migration304, /resolve_company_payable_amount/);
assert.match(migration304, /PRE_APPROVAL_PAID/);
assert.doesNotMatch(migration304, /drop table public\.plans/i);

const part1 = readFileSync(join(root, "supabase/migrations/274_commercial_saas_payment_foundation.sql"), "utf8");
assert.match(part1, /list_price/);

console.log("company-approval-workspace-contract.test.mts: ok");
