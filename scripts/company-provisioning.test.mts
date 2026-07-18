/**
 * Unit tests: company role templates + tenant provisioning guards.
 * Run: tsx scripts/company-provisioning.test.mts
 */
import assert from "node:assert/strict";
import {
  filterRolesForCompany,
  isRoleAssignableToCompany,
} from "../artifacts/login-app/src/lib/users/role-company-validation.ts";
import {
  PROVISION_REJECTION,
  validateProvisionRequest,
} from "../supabase/functions/provision-user/validation.ts";

const COMPANY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COMPANY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ROLE_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ROLE_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const GLOBAL_ROLE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const PLATFORM_TEMPLATE_NAMES = ["Admin", "Manager", "Employee"] as const;

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(
    () => console.log(`[PASS] ${name}`),
    (error) => {
      console.error(`[FAIL] ${name}`);
      throw error;
    },
  );
}

const roleA = { id: ROLE_A, company_id: COMPANY_A, is_system: false, name: "Admin" };
const roleB = { id: ROLE_B, company_id: COMPANY_B, is_system: false, name: "Admin" };
const globalRole = { id: GLOBAL_ROLE, company_id: null, is_system: true, name: "Global Operator" };

await test("Platform default role templates include Admin, Manager, Employee", () => {
  assert.deepEqual([...PLATFORM_TEMPLATE_NAMES], ["Admin", "Manager", "Employee"]);
});

await test("New company roles should be tenant-scoped (company_id set)", () => {
  const provisionedRole = { id: "role-1", company_id: COMPANY_A, is_system: false, name: "Admin" };
  assert.equal(provisionedRole.company_id, COMPANY_A);
  assert.equal(provisionedRole.is_system, false);
});

await test("Company A dropdown includes tenant + intentional global roles", () => {
  const options = filterRolesForCompany([roleA, roleB, globalRole], COMPANY_A);
  assert.equal(options.length, 2);
  assert.ok(options.some((role) => role.id === ROLE_A));
  assert.ok(options.some((role) => role.id === GLOBAL_ROLE));
});

await test("Company A cannot assign Company B role", () => {
  assert.equal(isRoleAssignableToCompany(roleB, COMPANY_A), false);
});

await test("Global role is assignable to any tenant", () => {
  assert.equal(isRoleAssignableToCompany(globalRole, COMPANY_A), true);
  assert.equal(isRoleAssignableToCompany(globalRole, COMPANY_B), true);
});

await test("Invite user rejects company with zero tenant roles", () => {
  const result = validateProvisionRequest({
    callerUserId: "super-1",
    callerCompanyId: null,
    isSuperAdmin: true,
    hasUsersEdit: true,
    requestedCompanyId: COMPANY_A,
    requestedRoleId: ROLE_A,
    role: roleA,
    existingTargetProfile: null,
    companyTenantRoleCount: 0,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.auditReason, PROVISION_REJECTION.COMPANY_HAS_NO_ROLES);
  }
});

await test("Invite user accepts global role for target company", () => {
  const result = validateProvisionRequest({
    callerUserId: "super-1",
    callerCompanyId: null,
    isSuperAdmin: true,
    hasUsersEdit: true,
    requestedCompanyId: COMPANY_A,
    requestedRoleId: GLOBAL_ROLE,
    role: globalRole,
    existingTargetProfile: null,
    companyTenantRoleCount: 3,
  });
  assert.equal(result.ok, true);
});

await test("Invite user rejects cross-tenant role assignment", () => {
  const result = validateProvisionRequest({
    callerUserId: "super-1",
    callerCompanyId: null,
    isSuperAdmin: true,
    hasUsersEdit: true,
    requestedCompanyId: COMPANY_A,
    requestedRoleId: ROLE_B,
    role: roleB,
    existingTargetProfile: null,
    companyTenantRoleCount: 3,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.auditReason, PROVISION_REJECTION.ROLE_TENANT_MISMATCH);
  }
});

console.log("\nAll company provisioning unit tests passed.");
