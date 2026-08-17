/**
 * Focused tests: Company Feature Groups ↔ permission bundles.
 * Run: pnpm exec tsx --test scripts/company-feature-groups.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  assertPermissionsAvailableForCompany,
  filterPermissionsAvailableForCompany,
  groupPermissionsByFeature,
  isPermissionAvailableForCompany,
} from "../src/lib/billing/feature-definition-permissions.ts";
import { BILLING_FEATURE_CODES } from "../src/lib/billing/feature-code-map.ts";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "../../..");
const migration299 = readFileSync(
  resolve(projectRoot, "supabase/migrations/299_feature_definition_permissions.sql"),
  "utf8",
);
const migration297 = readFileSync(
  resolve(projectRoot, "supabase/migrations/297_rbac_permission_delegation_guard.sql"),
  "utf8",
);
const dialog = readFileSync(
  resolve(here, "../src/components/companies/company-features-access-dialog.tsx"),
  "utf8",
);
const rolesPage = readFileSync(resolve(here, "../src/pages/roles.tsx"), "utf8");

const sampleRows = [
  { feature_code: "customers", permission_code: "customers.view" },
  { feature_code: "customers", permission_code: "customers.create" },
  { feature_code: "customers", permission_code: "customers.search" },
  { feature_code: "leads", permission_code: "leads.view" },
  { feature_code: "leads", permission_code: "leads.create" },
  { feature_code: "bookings", permission_code: "bookings.view" },
];

describe("TEST 1 — Group catalog (feature_definitions codes)", () => {
  it("reuses existing billing feature codes as company groups", () => {
    assert.ok(BILLING_FEATURE_CODES.includes("customers"));
    assert.ok(BILLING_FEATURE_CODES.includes("leads"));
    assert.ok(BILLING_FEATURE_CODES.includes("bookings"));
    assert.match(migration299, /feature_definition_permissions/);
    assert.match(migration299, /references public\.feature_definitions/);
  });
});

describe("TEST 2 — CRM/customers resolves to expected permissions", () => {
  it("maps customers feature to customers.* codes", () => {
    const map = groupPermissionsByFeature(sampleRows);
    assert.deepEqual(map.get("customers"), [
      "customers.create",
      "customers.search",
      "customers.view",
    ]);
    assert.match(migration299, /\('customers', 'customers\.view'\)/);
  });
});

describe("TEST 3/4 — Selecting CRM exposes capability without auto-granting employees", () => {
  it("UI documents capability vs employee RBAC separation", () => {
    assert.match(dialog, /employeeRbacHint/);
    assert.match(dialog, /groupsHint/);
    assert.doesNotMatch(dialog, /insert into user_roles/i);
  });
});

describe("TEST 5/6 — Employee RBAC + company gate", () => {
  it("disabled finance/leads blocks mapped permissions for non-super-admin", () => {
    const map = groupPermissionsByFeature(sampleRows);
    const enabled = new Set(["customers"]);
    assert.equal(
      isPermissionAvailableForCompany("customers.view", {
        isSuperAdmin: false,
        featurePermissions: map,
        isFeatureEnabled: (c) => enabled.has(c),
      }),
      true,
    );
    assert.equal(
      isPermissionAvailableForCompany("leads.create", {
        isSuperAdmin: false,
        featurePermissions: map,
        isFeatureEnabled: (c) => enabled.has(c),
      }),
      false,
    );
  });

  it("Roles page intersects delegable with company-available permissions", () => {
    assert.match(rolesPage, /filterPermissionsAvailableForCompany/);
    assert.match(rolesPage, /filterDelegablePermissionRecords/);
  });
});

describe("TEST 7/8 — Super Admin vs Company Admin configuration", () => {
  it("mapping writes require is_super_admin; company grants stay on existing RPCs", () => {
    assert.match(migration299, /feature_definition_permissions_write_super_admin/);
    assert.match(migration299, /using \(public\.is_super_admin\(\)\)/);
    assert.match(dialog, /useSetCompanyFeatureGrant/);
  });
});

describe("TEST 9/10 — Existing data preserved", () => {
  it("migration does not delete overrides, roles, or user_roles", () => {
    assert.doesNotMatch(migration299, /delete from public\.company_feature_overrides/i);
    assert.doesNotMatch(migration299, /delete from public\.roles/i);
    assert.doesNotMatch(migration299, /delete from public\.user_roles/i);
  });
});

describe("TEST 11 — Migration 297 delegation still present", () => {
  it("297 file still enforces role_delegation_denied", () => {
    assert.match(migration297, /role_delegation_denied/);
    assert.match(migration297, /actor_can_delegate_role/);
  });

  it("299 strengthens actor_can_delegate with company availability", () => {
    assert.match(migration299, /permission_available_to_company/);
    assert.match(migration299, /actor_can_delegate_permission/);
  });
});

describe("TEST 12 — Isolation remains company-scoped", () => {
  it("availability helper is company_id scoped", () => {
    assert.match(migration299, /is_feature_enabled\(p_company_id, fdp\.feature_code\)/);
  });
});

describe("TEST 13 — Filter helpers for company-available catalog", () => {
  it("filters permission records to enabled features only", () => {
    const map = groupPermissionsByFeature(sampleRows);
    const catalog = [
      { id: "1", code: "customers.view" },
      { id: "2", code: "leads.view" },
      { id: "3", code: "bookings.view" },
    ];
    const filtered = filterPermissionsAvailableForCompany(catalog, {
      isSuperAdmin: false,
      featurePermissions: map,
      isFeatureEnabled: (c) => c === "customers" || c === "bookings",
    });
    assert.deepEqual(
      filtered.map((p) => p.code),
      ["customers.view", "bookings.view"],
    );
    assert.throws(
      () =>
        assertPermissionsAvailableForCompany(["leads.create"], {
          isSuperAdmin: false,
          featurePermissions: map,
          isFeatureEnabled: (c) => c === "customers",
        }),
      /company_feature_permission_denied/,
    );
  });
});
