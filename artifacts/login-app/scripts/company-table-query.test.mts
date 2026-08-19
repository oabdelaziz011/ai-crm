/**
 * Companies table 2.0 query/sort/actions tests.
 * Run: node --experimental-strip-types artifacts/login-app/scripts/company-table-query.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Company, Plan } from "../src/lib/types.ts";
import {
  applyCompanyTableQuery,
  companyPackageDisplaySource,
  countActiveCompanyTableFilters,
  DEFAULT_COMPANY_TABLE_SORT,
  EMPTY_COMPANY_TABLE_FILTERS,
  isCompaniesWorkspaceRow,
  isLeftoverDeletedTestCompanyName,
  paginateCompanyTable,
  resolveCompanyDisplayStatus,
  resolveCompanyPackageKey,
  uniqueCompanyFilterValues,
  type CompanyTableFilters,
} from "../src/lib/companies/company-table-query.ts";
import {
  companyRowActionRequiresConfirm,
  visibleCompanyRowActions,
  type CompanyRowActionCapabilities,
} from "../src/lib/companies/company-row-actions.ts";

const FULL_CAPS: CompanyRowActionCapabilities = {
  canView: true,
  canEdit: true,
  canDelete: true,
  canCommercial: true,
  canViewBilling: true,
  canEditBilling: true,
};

function plan(code: string, name: string, id: string): Plan {
  return {
    id,
    name,
    code,
    price_monthly: 0,
    price_yearly: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

function company(overrides: Partial<Company> = {}): Company {
  return {
    id: "c1",
    name: "Alpha Clinic",
    logo_url: null,
    company_type: "tenant",
    business_type: "clinic",
    industry: "healthcare",
    contact_person: "Sara",
    contact_email: "sara@example.com",
    contact_phone: "+966500000000",
    status: "Active",
    approval_status: "approved",
    approval_requested_at: "2026-08-01T10:00:00.000Z",
    plan_id: "plan-basic",
    subscription_plan: "Basic",
    subscription_status: "active",
    billing_cycle: "monthly",
    subscription_expires_at: null,
    tenant_provisioning_status: "completed",
    created_at: "2026-08-01T10:00:00.000Z",
    updated_at: "2026-08-10T10:00:00.000Z",
    plan: plan("basic", "Basic", "plan-basic"),
    primary_branch: { city: "Riyadh", country: "Saudi Arabia" },
    ...overrides,
  };
}

console.log("\nCompanies table 2.0\n");

const pending = company({
  id: "p1",
  name: "Pending Co",
  status: "Trial",
  approval_status: "pending",
  updated_at: "2026-08-11T09:00:00.000Z",
});
const trial = company({
  id: "t1",
  name: "Trial Co",
  status: "Trial",
  subscription_status: "trialing",
  updated_at: "2026-08-12T09:00:00.000Z",
});
const active = company({
  id: "a1",
  name: "Active Co",
  subscription_plan: "Pro",
  plan: plan("pro", "Pro", "plan-pro"),
  updated_at: "2026-08-09T09:00:00.000Z",
});
const suspended = company({
  id: "s1",
  name: "Suspended Co",
  status: "Suspended",
  industry: "hospitality",
  business_type: "hotel",
  contact_person: "Omar",
  updated_at: "2026-08-08T09:00:00.000Z",
});
const rejected = company({
  id: "r1",
  name: "Rejected Co",
  approval_status: "rejected",
  status: "Trial",
  updated_at: "2026-08-07T09:00:00.000Z",
});
const platform = company({
  id: "x1",
  name: "RL7F DELETED leftover",
  company_type: "platform",
  updated_at: "2026-08-13T09:00:00.000Z",
});
const noPackage = company({
  id: "n1",
  name: "No Package Co",
  subscription_plan: "",
  plan: null,
  contact_email: "none@example.com",
  updated_at: "2026-08-06T09:00:00.000Z",
});
const uuidPlan = company({
  id: "u1",
  name: "Uuid Plan Co",
  subscription_plan: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  plan: null,
  updated_at: "2026-08-05T09:00:00.000Z",
});

const all = [pending, trial, active, suspended, rejected, platform, noPackage, uuidPlan];

assert.equal(isCompaniesWorkspaceRow(platform), false);
assert.equal(isLeftoverDeletedTestCompanyName(platform.name), true);
assert.equal(resolveCompanyDisplayStatus(pending), "pending");
assert.equal(resolveCompanyDisplayStatus(rejected), "rejected");
assert.equal(resolveCompanyDisplayStatus(trial), "trial");
assert.equal(resolveCompanyPackageKey(active), "pro");
assert.equal(resolveCompanyPackageKey(noPackage), null);
assert.equal(resolveCompanyPackageKey(uuidPlan), null);
assert.equal(companyPackageDisplaySource(uuidPlan).rawLabel, null);

const defaultRows = applyCompanyTableQuery(all, EMPTY_COMPANY_TABLE_FILTERS);
assert.equal(defaultRows.some((row) => row.company_type === "platform"), false);
assert.deepEqual(
  defaultRows.map((row) => row.id),
  ["t1", "p1", "a1", "s1", "r1", "n1", "u1"],
);
console.log("  ✓ default sort is updated_at desc and platform rows are excluded");

const stable = applyCompanyTableQuery(
  [
    company({ id: "b", name: "Beta", updated_at: "2026-08-10T00:00:00.000Z" }),
    company({ id: "a", name: "Alpha", updated_at: "2026-08-10T00:00:00.000Z" }),
  ],
  EMPTY_COMPANY_TABLE_FILTERS,
);
assert.deepEqual(stable.map((row) => row.name), ["Alpha", "Beta"]);
console.log("  ✓ equal timestamps use stable name/id tie-break");

const asc = applyCompanyTableQuery(all, EMPTY_COMPANY_TABLE_FILTERS, {
  key: "updated_at",
  direction: "asc",
});
assert.equal(asc[0]?.id, "u1");
assert.equal(asc[asc.length - 1]?.id, "t1");
console.log("  ✓ ascending/descending sort");

assert.deepEqual(
  applyCompanyTableQuery(all, { ...EMPTY_COMPANY_TABLE_FILTERS, search: "Active Co" }).map((row) => row.id),
  ["a1"],
);
assert.deepEqual(
  applyCompanyTableQuery(all, { ...EMPTY_COMPANY_TABLE_FILTERS, displayStatus: "pending" }).map((row) => row.id),
  ["p1"],
);
assert.deepEqual(
  applyCompanyTableQuery(all, { ...EMPTY_COMPANY_TABLE_FILTERS, displayStatus: "rejected" }).map((row) => row.id),
  ["r1"],
);
assert.deepEqual(
  applyCompanyTableQuery(all, { ...EMPTY_COMPANY_TABLE_FILTERS, packageKey: "pro" }).map((row) => row.id),
  ["a1"],
);
assert.deepEqual(
  applyCompanyTableQuery(all, { ...EMPTY_COMPANY_TABLE_FILTERS, packageKey: "none" }).map((row) => row.id).sort(),
  ["n1", "u1"],
);
assert.deepEqual(
  applyCompanyTableQuery(all, { ...EMPTY_COMPANY_TABLE_FILTERS, industry: "hospitality" }).map((row) => row.id),
  ["s1"],
);
assert.deepEqual(
  applyCompanyTableQuery(all, { ...EMPTY_COMPANY_TABLE_FILTERS, businessType: "hotel" }).map((row) => row.id),
  ["s1"],
);
assert.deepEqual(
  applyCompanyTableQuery(all, { ...EMPTY_COMPANY_TABLE_FILTERS, owner: "Omar" }).map((row) => row.id),
  ["s1"],
);
assert.equal(
  applyCompanyTableQuery(all, {
    ...EMPTY_COMPANY_TABLE_FILTERS,
    createdFrom: "2026-08-01",
    createdTo: "2026-08-01",
  }).length,
  7,
);
assert.equal(
  applyCompanyTableQuery(all, {
    ...EMPTY_COMPANY_TABLE_FILTERS,
    name: { value: "Act", mode: "startsWith" },
  })[0]?.id,
  "a1",
);
console.log("  ✓ search, status, package, industry, business type, owner, date, starts-with");

const combined: CompanyTableFilters = {
  ...EMPTY_COMPANY_TABLE_FILTERS,
  displayStatus: "active",
  packageKey: "pro",
  industry: "healthcare",
};
assert.deepEqual(applyCompanyTableQuery(all, combined).map((row) => row.id), ["a1"]);
assert.ok(countActiveCompanyTableFilters(combined) >= 3);
assert.equal(countActiveCompanyTableFilters(EMPTY_COMPANY_TABLE_FILTERS), 0);
assert.equal(
  applyCompanyTableQuery(all, EMPTY_COMPANY_TABLE_FILTERS, DEFAULT_COMPANY_TABLE_SORT)[0]?.id,
  "t1",
);
console.log("  ✓ combined filters and clear-filters restore default sort");

const paged = paginateCompanyTable(defaultRows, 2, 3);
assert.equal(paged.page, 2);
assert.equal(paged.totalPages, 3);
assert.equal(paged.rows.length, 3);
const afterFilter = paginateCompanyTable(
  applyCompanyTableQuery(all, { ...EMPTY_COMPANY_TABLE_FILTERS, displayStatus: "pending" }),
  9,
  8,
);
assert.equal(afterFilter.page, 1);
assert.equal(afterFilter.rows[0]?.id, "p1");
console.log("  ✓ pagination clamps after filtering");

const pendingActions = visibleCompanyRowActions(pending, FULL_CAPS).map((row) => row.id);
assert.ok(pendingActions.includes("review"));
assert.ok(pendingActions.includes("reject"));
assert.ok(!pendingActions.includes("suspend"));
assert.ok(!pendingActions.includes("convertTrial"));
const trialActions = visibleCompanyRowActions(trial, FULL_CAPS).map((row) => row.id);
assert.ok(trialActions.includes("extendTrial"));
assert.ok(trialActions.includes("convertTrial"));
assert.ok(trialActions.includes("suspend"));
assert.ok(trialActions.includes("features"));
assert.ok(trialActions.includes("subscription"));
assert.ok(!trialActions.includes("changePackage"));
const activeActions = visibleCompanyRowActions(active, FULL_CAPS).map((row) => row.id);
assert.ok(activeActions.includes("features"));
assert.ok(activeActions.includes("subscription"));
assert.ok(activeActions.includes("changePackage"));
assert.ok(!activeActions.includes("convertTrial"));
assert.ok(!pendingActions.includes("features"));
assert.ok(!pendingActions.includes("subscription"));
assert.ok(!pendingActions.includes("changePackage"));
const suspendedActions = visibleCompanyRowActions(suspended, FULL_CAPS).map((row) => row.id);
assert.ok(suspendedActions.includes("restore"));
assert.ok(!suspendedActions.includes("suspend"));
assert.ok(!suspendedActions.includes("changePackage"));
const rejectedActions = visibleCompanyRowActions(rejected, FULL_CAPS).map((row) => row.id);
assert.ok(rejectedActions.includes("review"));
assert.ok(!rejectedActions.includes("reject"));
const noPerms = visibleCompanyRowActions(active, {
  canView: true,
  canEdit: false,
  canDelete: false,
  canCommercial: false,
  canViewBilling: false,
  canEditBilling: false,
}).map((row) => row.id);
assert.deepEqual(noPerms, ["view"]);
assert.equal(companyRowActionRequiresConfirm("delete"), true);
assert.equal(companyRowActionRequiresConfirm("view"), false);
console.log("  ✓ three-dot actions respect status and permissions");

assert.equal(resolveCompanyPackageKey(noPackage), null);
assert.ok(!uniqueCompanyFilterValues(all).owners.includes(""));
console.log("  ✓ no empty/undefined package or owner labels in option lists");

const here = dirname(fileURLToPath(import.meta.url));
const en = JSON.parse(readFileSync(join(here, "../src/locales/en/common.json"), "utf8"));
const ar = JSON.parse(readFileSync(join(here, "../src/locales/ar/common.json"), "utf8"));
const requiredKeys = [
  "companies.table.updated",
  "companies.actions.view",
  "companies.packages.none",
  "companies.filters.clear",
  "companies.emptyFiltered",
];
for (const path of requiredKeys) {
  const segs = path.split(".");
  let enNode: unknown = en;
  let arNode: unknown = ar;
  for (const seg of segs) {
    enNode = (enNode as Record<string, unknown>)[seg];
    arNode = (arNode as Record<string, unknown>)[seg];
  }
  assert.equal(typeof enNode, "string", `missing EN ${path}`);
  assert.equal(typeof arNode, "string", `missing AR ${path}`);
  assert.notEqual(arNode, enNode, `AR equals EN for ${path}`);
}
console.log("  ✓ Arabic localization keys exist and differ from English\n");
