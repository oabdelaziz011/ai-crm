/**
 * Company details / suspend / reject / tenant access tests.
 * Run: npx tsx --tsconfig tsconfig.json scripts/company-access-flow.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canRejectCompany,
  companyInternalFlag,
  resolveTenantCompanyAccessBlock,
  trimRequiredReason,
  viewOpensReviewWizard,
} from "../src/lib/companies/company-access-state.ts";
import { occupancyDisplayRow, occupancyRatioLabel } from "../src/lib/companies/company-occupancy-display.ts";
import { visibleCompanyRowActions } from "../src/lib/companies/company-row-actions.ts";
import {
  companyReviewFooterActions,
  sanitizeCompanyLifecycleError,
} from "../src/lib/companies/company-lifecycle-errors.ts";
import type { Company } from "../src/lib/types.ts";

function company(overrides: Partial<Company> = {}): Company {
  return {
    id: "c1",
    name: "Acme",
    logo_url: null,
    status: "Active",
    approval_status: "approved",
    plan_id: "plan-basic",
    subscription_plan: "Basic",
    subscription_status: "active",
    billing_cycle: "monthly",
    subscription_expires_at: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-10T00:00:00.000Z",
    ...overrides,
  };
}

const adminCaps = {
  canView: true,
  canEdit: true,
  canDelete: true,
  canCommercial: true,
  canViewBilling: true,
  canEditBilling: true,
};

const tenantCaps = {
  canView: false,
  canEdit: false,
  canDelete: false,
  canCommercial: false,
  canViewBilling: false,
  canEditBilling: false,
};

console.log("\nCompany details + access flow\n");

assert.equal(viewOpensReviewWizard(), false);
assert.ok(visibleCompanyRowActions(company(), adminCaps).some((row) => row.id === "view"));
assert.ok(
  visibleCompanyRowActions(company({ approval_status: "pending", status: "Trial" }), adminCaps).some(
    (row) => row.id === "review",
  ),
);
console.log("  ✓ view is distinct from review");

const occupancy = occupancyDisplayRow({
  current_count: 12,
  max_allowed: 25,
  remaining: 13,
  is_over_limit: false,
  is_unlimited: false,
});
assert.equal(occupancy.used, 12);
assert.equal(occupancy.limit, 25);
assert.equal(occupancy.remaining, 13);
assert.equal(occupancyRatioLabel(occupancy, "unlimited"), "12 / 25");
const over = occupancyDisplayRow({
  current_count: 6,
  max_allowed: 5,
  remaining: 0,
  is_over_limit: true,
  is_unlimited: false,
});
assert.equal(over.overLimit, true);
console.log("  ✓ occupancy current/limit/remaining and over-limit");

assert.equal(companyInternalFlag(company({ status: "Suspended" })), "suspended");
assert.equal(companyInternalFlag(company({ approval_status: "rejected", status: "Trial" })), "rejected");
assert.equal(companyInternalFlag(company()), null);
console.log("  ✓ status and approval stay separate for admin flags");

assert.equal(trimRequiredReason("   "), null);
assert.equal(trimRequiredReason("late payment"), "late payment");
assert.equal(canRejectCompany(company({ approval_status: "pending" })), true);
assert.equal(canRejectCompany(company({ approval_status: "approved" })), false);
assert.ok(!visibleCompanyRowActions(company({ approval_status: "approved" }), adminCaps).some((row) => row.id === "reject"));
assert.ok(
  visibleCompanyRowActions(company({ approval_status: "pending", status: "Trial" }), adminCaps).some(
    (row) => row.id === "reject",
  ),
);
console.log("  ✓ reject only when pending; empty reason rejected");

const tenantSuspended = resolveTenantCompanyAccessBlock({
  isSuperAdmin: false,
  status: "Suspended",
  approvalStatus: "approved",
  suspensionReason: "late invoice",
  rejectionReason: null,
});
assert.equal(tenantSuspended?.kind, "suspended");
assert.equal(tenantSuspended?.reason, "late invoice");

const tenantRejected = resolveTenantCompanyAccessBlock({
  isSuperAdmin: false,
  status: "Trial",
  approvalStatus: "rejected",
  suspensionReason: null,
  rejectionReason: "incomplete documents",
});
assert.equal(tenantRejected?.kind, "rejected");
assert.equal(tenantRejected?.reason, "incomplete documents");

const pendingAllowed = resolveTenantCompanyAccessBlock({
  isSuperAdmin: false,
  status: "Trial",
  approvalStatus: "pending",
});
assert.equal(pendingAllowed, null);

const adminBypass = resolveTenantCompanyAccessBlock({
  isSuperAdmin: true,
  status: "Suspended",
  approvalStatus: "rejected",
  suspensionReason: "secret",
});
assert.equal(adminBypass, null);
console.log("  ✓ tenant suspended/rejected blocked with reason; pending unchanged; admin bypasses");

assert.ok(!visibleCompanyRowActions(company({ status: "Suspended" }), tenantCaps).some((row) => row.id === "suspend"));
assert.ok(!visibleCompanyRowActions(company({ approval_status: "pending" }), tenantCaps).some((row) => row.id === "reject"));
console.log("  ✓ tenant capabilities cannot suspend or reject");

assert.ok(visibleCompanyRowActions(company({ status: "Suspended" }), adminCaps).some((row) => row.id === "restore"));
assert.ok(!visibleCompanyRowActions(company({ status: "Suspended" }), adminCaps).some((row) => row.id === "suspend"));
assert.ok(
  visibleCompanyRowActions(company({ approval_status: "pending", status: "Trial" }), adminCaps).some(
    (row) => row.id === "reject",
  ),
);
console.log("  ✓ action menu state gates suspend/restore/reject");

const step1 = companyReviewFooterActions({ step: 1, pending: true });
assert.equal(step1.showReject, true);
assert.equal(step1.rejectPlacement, "start");
assert.equal(step1.showBack, false);
assert.equal(step1.showNext, true);
const step2 = companyReviewFooterActions({ step: 2, pending: true });
assert.equal(step2.showReject, false);
assert.equal(step2.showBack, true);
console.log("  ✓ review step 1 places Reject beside Next");

assert.equal(
  sanitizeCompanyLifecycleError(new Error("permission denied for table companies"), "تعذر إيقاف الشركة. حاول مرة أخرى."),
  "تعذر إيقاف الشركة. حاول مرة أخرى.",
);
assert.equal(sanitizeCompanyLifecycleError(new Error("suspension_reason_required"), "fallback"), "fallback");
console.log("  ✓ suspend errors are sanitized");

const here = dirname(fileURLToPath(import.meta.url));
const workspaceSrc = readFileSync(
  join(here, "../src/components/companies/approval/company-approval-workspace.tsx"),
  "utf8",
);
assert.match(workspaceSrc, /function ReviewSection/);
assert.doesNotMatch(workspaceSrc, /wizardStep === 1[\s\S]{0,80}lg:grid-cols-2">\s*<DashboardCard/);
assert.match(workspaceSrc, /wizardStep === 1 && pending/);
assert.match(workspaceSrc, /openRejectConfirmation/);
assert.match(workspaceSrc, /occupancyDisplayRow\(occupancyQuery\.data\.users\)/);
assert.match(workspaceSrc, /<table/);
const menuSrc = readFileSync(join(here, "../src/components/companies/table/company-row-actions-menu.tsx"), "utf8");
assert.match(menuSrc, /MoreVertical/);
assert.match(menuSrc, /companies\.actions\.menuTitle/);
console.log("  ✓ review workspace and action menu source contracts");

const en = JSON.parse(readFileSync(join(here, "../src/locales/en/common.json"), "utf8"));
const ar = JSON.parse(readFileSync(join(here, "../src/locales/ar/common.json"), "utf8"));
for (const path of [
  "companies.details.eyebrow",
  "companies.lifecycle.suspendTitle",
  "companies.flags.suspended",
  "dashboard.companyAccess.suspendedTitle",
  "dashboard.companyAccess.rejectedTitle",
]) {
  const segs = path.split(".");
  let enNode: unknown = en;
  let arNode: unknown = ar;
  for (const seg of segs) {
    enNode = (enNode as Record<string, unknown>)[seg];
    arNode = (arNode as Record<string, unknown>)[seg];
  }
  assert.equal(typeof enNode, "string", `missing EN ${path}`);
  assert.equal(typeof arNode, "string", `missing AR ${path}`);
  assert.notEqual(arNode, enNode);
}
assert.match(String(ar.dashboard.companyAccess.suspendedTitle), /إيقاف|موقوف/);
assert.match(String(ar.dashboard.companyAccess.rejectedTitle), /رفض/);
console.log("  ✓ Arabic tenant access copy exists\n");
