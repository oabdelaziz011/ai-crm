/**
 * Integration tests: company provisioning + user role guards (pure logic paths).
 * Run: tsx scripts/company-provisioning-integration.test.mts
 */
import assert from "node:assert/strict";
import {
  assertRoleAssignableToCompany,
  filterRolesForCompany,
  RoleAssignmentError,
  ROLE_ASSIGNMENT_REJECTION,
} from "../artifacts/login-app/src/lib/users/role-company-validation.ts";
import {
  PROVISION_REJECTION,
  validateProvisionRequest,
} from "../supabase/functions/provision-user/validation.ts";

const COMPANY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COMPANY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(
    () => console.log(`[PASS] ${name}`),
    (error) => {
      console.error(`[FAIL] ${name}`);
      throw error;
    },
  );
}

const companyARoles = [
  { id: "admin-a", company_id: COMPANY_A, name: "Admin" },
  { id: "manager-a", company_id: COMPANY_A, name: "Manager" },
  { id: "employee-a", company_id: COMPANY_A, name: "Employee" },
];
const companyBRoles = [{ id: "admin-b", company_id: COMPANY_B, name: "Admin" }];

await test("Integration: provisioned company exposes only tenant roles in filter", () => {
  const visible = filterRolesForCompany([...companyARoles, ...companyBRoles], COMPANY_A);
  assert.equal(visible.length, 3);
  assert.ok(visible.every((role) => role.company_id === COMPANY_A));
});

await test("Integration: edit/create validation rejects cross-tenant role", () => {
  assert.throws(
    () => assertRoleAssignableToCompany(companyBRoles[0], COMPANY_A),
    (error: unknown) => {
      assert.ok(error instanceof RoleAssignmentError);
      assert.equal(error.code, ROLE_ASSIGNMENT_REJECTION.ROLE_TENANT_MISMATCH);
      return true;
    },
  );
});

await test("Integration: user creation blocked when company has no roles", () => {
  const result = validateProvisionRequest({
    callerUserId: "admin-a",
    callerCompanyId: COMPANY_A,
    isSuperAdmin: false,
    hasUsersEdit: true,
    requestedCompanyId: COMPANY_A,
    requestedRoleId: "admin-a",
    role: { id: "admin-a", company_id: COMPANY_A, is_system: false },
    existingTargetProfile: null,
    companyTenantRoleCount: 0,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.auditReason, PROVISION_REJECTION.COMPANY_HAS_NO_ROLES);
  }
});

await test("Integration: existing company repair scenario accepts tenant role after provisioning", () => {
  const result = validateProvisionRequest({
    callerUserId: "super-1",
    callerCompanyId: null,
    isSuperAdmin: true,
    hasUsersEdit: true,
    requestedCompanyId: COMPANY_A,
    requestedRoleId: "admin-a",
    role: { id: "admin-a", company_id: COMPANY_A, is_system: false },
    existingTargetProfile: null,
    companyTenantRoleCount: 3,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.effectiveCompanyId, COMPANY_A);
  }
});

console.log("\nAll company provisioning integration tests passed.");
