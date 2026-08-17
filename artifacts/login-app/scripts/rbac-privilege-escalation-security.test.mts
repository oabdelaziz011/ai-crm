import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertPermissionsAreDelegable,
  assertRolePermissionsAreDelegable,
  canDelegatePermissionCode,
  filterDelegablePermissionCodes,
} from "../src/lib/rbac/permission-delegation.ts";

function has(...codes: string[]) {
  const set = new Set(codes);
  return (code: string) => set.has(code);
}

describe("RBAC privilege-delegation invariant", () => {
  it("TEST 1 — limited actor cannot request permissions they do not hold", () => {
    const actor = has("customers.view", "customers.search");
    assert.equal(canDelegatePermissionCode("customers.view", actor, false), true);
    assert.equal(canDelegatePermissionCode("roles.edit", actor, false), false);
    assert.equal(canDelegatePermissionCode("billing.edit", actor, false), false);

    assert.throws(
      () =>
        assertPermissionsAreDelegable(
          ["customers.view", "users.edit", "billing.edit"],
          actor,
          false,
        ),
      /permission_delegation_denied/,
    );
  });

  it("TEST 2 — adding a higher privilege to an existing role payload is denied", () => {
    const manager = has("customers.view", "leads.view", "roles.edit");
    assert.throws(
      () =>
        assertPermissionsAreDelegable(
          ["customers.view", "leads.view", "billing.manage"],
          manager,
          false,
        ),
      /permission_delegation_denied/,
    );
  });

  it("TEST 3 — assigning a powerful role fails when actor lacks its permissions", () => {
    const actor = has("customers.view", "users.edit");
    const powerfulRole = ["customers.view", "billing.edit", "roles.edit"];
    assert.throws(
      () => assertRolePermissionsAreDelegable(powerfulRole, actor, false),
      /permission_delegation_denied/,
    );
  });

  it("TEST 4 — self-grant of a powerful role is denied by the same subset rule", () => {
    const actor = has("users.edit", "customers.view");
    assert.throws(
      () =>
        assertRolePermissionsAreDelegable(
          ["users.edit", "roles.edit", "settings.edit"],
          actor,
          false,
        ),
      /permission_delegation_denied/,
    );
  });

  it("TEST 8 — company admin within scope may grant only held permissions", () => {
    const admin = has(
      "customers.view",
      "customers.edit",
      "roles.create",
      "roles.edit",
      "users.edit",
    );
    assert.deepEqual(
      filterDelegablePermissionCodes(
        ["customers.view", "customers.edit", "billing.edit", "roles.edit"],
        admin,
        false,
      ),
      ["customers.view", "customers.edit", "roles.edit"],
    );
    assert.doesNotThrow(() =>
      assertPermissionsAreDelegable(["customers.view", "roles.edit"], admin, false),
    );
  });

  it("TEST 9 — Super Admin bypasses the subset restriction", () => {
    const none = () => false;
    assert.equal(canDelegatePermissionCode("billing.edit", none, true), true);
    assert.doesNotThrow(() =>
      assertPermissionsAreDelegable(["billing.edit", "roles.edit", "users.edit"], none, true),
    );
  });

  it("TEST 11 — protected/system role permissions cannot be mirrored by a limited actor", () => {
    const limited = has("roles.edit", "customers.view");
    const companyAdminTemplate = [
      "customers.view",
      "users.edit",
      "roles.edit",
      "billing.edit",
      "settings.edit",
    ];
    assert.throws(
      () => assertRolePermissionsAreDelegable(companyAdminTemplate, limited, false),
      /permission_delegation_denied/,
    );
  });

  it("TEST 12 — permission removal requests are not grants (empty / subset OK)", () => {
    const actor = has("customers.view", "roles.edit");
    assert.doesNotThrow(() => assertPermissionsAreDelegable([], actor, false));
    assert.doesNotThrow(() =>
      assertPermissionsAreDelegable(["customers.view"], actor, false),
    );
  });

  it("regression — original escalation path is blocked client-side (DB still authoritative)", () => {
    const employee = has("customers.view", "customers.search", "roles.create");
    const attackPayload = [
      "customers.view",
      "users.edit",
      "roles.edit",
      "billing.edit",
      "settings.edit",
    ];
    assert.throws(
      () => assertPermissionsAreDelegable(attackPayload, employee, false),
      /permission_delegation_denied/,
    );
    assert.deepEqual(
      filterDelegablePermissionCodes(attackPayload, employee, false),
      ["customers.view"],
    );
  });
});
