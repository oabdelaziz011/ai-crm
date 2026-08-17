/**
 * Focused tests: tenant custom-role model (no mandatory Manager/Employee).
 * Run: pnpm exec tsx --test scripts/tenant-custom-roles-model.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  filterDelegablePermissionRecords,
  filterRolesForTenantManagement,
  isTenantManagedCustomRole,
} from "../src/lib/rbac/tenant-role-management.ts";
import {
  assertPermissionsAreDelegable,
  filterDelegablePermissionCodes,
} from "../src/lib/rbac/permission-delegation.ts";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "../../..");
const loginAppRoot = resolve(here, "..");

const migration298 = readFileSync(
  resolve(projectRoot, "supabase/migrations/298_tenant_admin_only_role_provisioning.sql"),
  "utf8",
);
const rolesPage = readFileSync(resolve(loginAppRoot, "src/pages/roles.tsx"), "utf8");
const migration297 = readFileSync(
  resolve(projectRoot, "supabase/migrations/297_rbac_permission_delegation_guard.sql"),
  "utf8",
);

describe("TEST 1 — New company provisioning (admin only)", () => {
  it("provisions only template_key = admin", () => {
    assert.match(migration298, /t\.template_key = 'admin'/);
    assert.match(migration298, /failed to ensure Company Admin role/);
    assert.doesNotMatch(
      migration298,
      /template_key in \('admin', 'manager', 'employee'\)\s*\)\s*<>\s*3/,
    );
  });

  it("does not insert Manager or Employee as mandatory defaults", () => {
    assert.doesNotMatch(migration298, /v_template\.template_key = 'manager'/);
    assert.doesNotMatch(migration298, /v_template\.template_key = 'employee'/);
  });
});

describe("TEST 2 — Roles page shows company CUSTOM roles only", () => {
  it("filters managed roles through tenant-role-management helper", () => {
    assert.match(rolesPage, /filterRolesForTenantManagement/);
    assert.match(rolesPage, /emptyCustomTitle/);
    assert.match(rolesPage, /managedRoles\.length === 0/);
  });

  it("hides DEFAULT Manager/Employee/Admin from tenant management list", () => {
    const roles = [
      { id: "1", name: "Company Admin", role_type: "DEFAULT", template_key: "admin" },
      { id: "2", name: "Manager", role_type: "DEFAULT", template_key: "manager" },
      { id: "3", name: "Employee", role_type: "DEFAULT", template_key: "employee" },
      { id: "4", name: "Sales Agent", role_type: "CUSTOM", template_key: null },
    ];
    const managed = filterRolesForTenantManagement(roles);
    assert.deepEqual(
      managed.map((r) => r.name),
      ["Sales Agent"],
    );
    assert.equal(isTenantManagedCustomRole(roles[0]), false);
    assert.equal(isTenantManagedCustomRole(roles[3]), true);
  });
});

describe("TEST 3/4/11/12 — Delegable permission selector", () => {
  const catalog = [
    { id: "1", code: "customers.view" },
    { id: "2", code: "leads.create" },
    { id: "3", code: "billing.edit" },
    { id: "4", code: "settings.edit" },
  ];
  const held = new Set(["customers.view", "leads.create"]);
  const hasPermission = (code: string) => held.has(code);

  it("TEST 11 — limited actor sees only delegable permissions", () => {
    const visible = filterDelegablePermissionRecords(catalog, hasPermission, false);
    assert.deepEqual(
      visible.map((p) => p.code),
      ["customers.view", "leads.create"],
    );
  });

  it("TEST 12 — select-all set equals actor-delegable codes", () => {
    const selectAllCodes = filterDelegablePermissionCodes(
      catalog.map((p) => p.code!),
      hasPermission,
      false,
    );
    assert.deepEqual(selectAllCodes, ["customers.view", "leads.create"]);
    assert.equal(selectAllCodes.includes("billing.edit"), false);
  });

  it("TEST 3 — owner may grant held permissions", () => {
    assert.doesNotThrow(() =>
      assertPermissionsAreDelegable(["customers.view", "leads.create"], hasPermission, false),
    );
  });

  it("TEST 4 — owner cannot grant undelegable permissions (client assert)", () => {
    assert.throws(
      () => assertPermissionsAreDelegable(["billing.edit"], hasPermission, false),
      /permission_delegation_denied/,
    );
  });

  it("roles page wires filtered permissions into Create Role dialog", () => {
    assert.match(rolesPage, /filterDelegablePermissionRecords/);
    assert.match(rolesPage, /permissions=\{permissions\}/);
  });
});

describe("TEST 5/6 — Assignment still guarded by migration 297", () => {
  it("replace_user_roles still raises role_delegation_denied", () => {
    assert.match(migration297, /role_delegation_denied/);
    assert.match(migration297, /actor_can_delegate_role/);
  });
});

describe("TEST 7 — Tenant isolation helpers remain company-scoped", () => {
  it("migration 297 keeps cross-tenant denial", () => {
    assert.match(migration297, /Cross tenant access denied/);
  });
});

describe("TEST 8/9 — Existing Manager/Employee/Admin preserved", () => {
  it("migration 298 does not delete roles or user_roles", () => {
    assert.doesNotMatch(migration298, /delete from public\.roles/i);
    assert.doesNotMatch(migration298, /delete from public\.user_roles/i);
  });
});

describe("TEST 10 — Super Admin bypass preserved", () => {
  it("Super Admin still sees full catalog and protected roles when opted in", () => {
    const catalog = [
      { id: "1", code: "billing.edit" },
      { id: "2", code: "customers.view" },
    ];
    const visible = filterDelegablePermissionRecords(catalog, () => false, true);
    assert.equal(visible.length, 2);

    const roles = [
      { name: "Company Admin", role_type: "DEFAULT" },
      { name: "Sales", role_type: "CUSTOM" },
    ];
    const managed = filterRolesForTenantManagement(roles, { includeProtected: true });
    assert.equal(managed.length, 2);
  });
});
