/**
 * Unit tests: role/company assignment guards (UI + client + provision-user).
 * Run: tsx scripts/user-role-company-validation.test.mts
 */
import assert from "node:assert/strict";
import {
  assertRoleAssignableToCompany,
  filterRolesForCompany,
  isRoleAssignableToCompany,
  ROLE_ASSIGNMENT_REJECTION,
  RoleAssignmentError,
} from "../artifacts/login-app/src/lib/users/role-company-validation.ts";
import {
  PROVISION_REJECTION,
  validateProvisionRequest,
} from "../supabase/functions/provision-user/validation.ts";

const COMPANY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COMPANY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ROLE_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ROLE_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(
    () => console.log(`[PASS] ${name}`),
    (error) => {
      console.error(`[FAIL] ${name}`);
      throw error;
    },
  );
}

const roleA = { id: ROLE_A, company_id: COMPANY_A, is_system: false, name: "Admin A" };
const roleB = { id: ROLE_B, company_id: COMPANY_B, is_system: true, name: "Admin B" };
const platformRole = { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", company_id: null, is_system: true, name: "Platform" };

await test("Company A cannot assign Company B role (filter)", () => {
  const options = filterRolesForCompany([roleA, roleB, platformRole], COMPANY_A);
  assert.equal(options.length, 2);
  assert.ok(options.some((role) => role.id === ROLE_A));
  assert.ok(options.some((role) => role.id === platformRole.id));
});

await test("Company B cannot assign Company A role (filter)", () => {
  const options = filterRolesForCompany([roleA, roleB], COMPANY_B);
  assert.equal(options.length, 1);
  assert.equal(options[0]?.id, ROLE_B);
});

await test("Company A cannot assign Company B role (assert)", () => {
  assert.throws(
    () => assertRoleAssignableToCompany(roleB, COMPANY_A),
    (error: unknown) => {
      assert.ok(error instanceof RoleAssignmentError);
      assert.equal(error.code, ROLE_ASSIGNMENT_REJECTION.ROLE_TENANT_MISMATCH);
      return true;
    },
  );
});

await test("Super Admin target company A — tenant + global roles pass", () => {
  assert.equal(isRoleAssignableToCompany(roleA, COMPANY_A), true);
  assert.equal(isRoleAssignableToCompany(roleB, COMPANY_A), false);
  assert.equal(isRoleAssignableToCompany(platformRole, COMPANY_A), true);
});

await test("Invite user — provision-user rejects cross-tenant role", () => {
  const result = validateProvisionRequest({
    callerUserId: "super-1",
    callerCompanyId: null,
    isSuperAdmin: true,
    hasUsersEdit: true,
    requestedCompanyId: COMPANY_A,
    requestedRoleId: ROLE_B,
    role: roleB,
    existingTargetProfile: null,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.auditReason, PROVISION_REJECTION.ROLE_TENANT_MISMATCH);
  }
});

await test("Invite user — provision-user accepts same-tenant role for Super Admin", () => {
  const result = validateProvisionRequest({
    callerUserId: "super-1",
    callerCompanyId: null,
    isSuperAdmin: true,
    hasUsersEdit: true,
    requestedCompanyId: COMPANY_A,
    requestedRoleId: ROLE_A,
    role: roleA,
    existingTargetProfile: null,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.effectiveCompanyId, COMPANY_A);
  }
});

await test("Company admin cannot assign other company role via provision-user", () => {
  const result = validateProvisionRequest({
    callerUserId: "admin-b",
    callerCompanyId: COMPANY_B,
    isSuperAdmin: false,
    hasUsersEdit: true,
    requestedCompanyId: COMPANY_B,
    requestedRoleId: ROLE_A,
    role: roleA,
    existingTargetProfile: null,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.auditReason, PROVISION_REJECTION.ROLE_TENANT_MISMATCH);
  }
});

console.log("\nAll user role/company validation tests passed.");
