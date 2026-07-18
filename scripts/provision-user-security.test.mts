/**
 * Unit tests for provision-user tenant validation.
 * Run: tsx scripts/provision-user-security.test.mts
 */
import assert from "node:assert/strict";
import {
  PROVISION_REJECTION,
  validateProvisionRequest,
} from "../supabase/functions/provision-user/validation.ts";

const BETA_COMPANY = "d0000010-0001-4001-8001-000000000002";
const GAMMA_COMPANY = "d0000010-0001-4001-8001-000000000003";
const BETA_EMPLOYEE_ROLE = "d0000030-0001-4001-8001-000000000004";
const BETA_ADMIN_ROLE = "d0000030-0001-4001-8001-000000000002";
const GAMMA_ADMIN_ROLE = "d0000030-0001-4001-8001-000000000005";

function baseInput(overrides: Partial<Parameters<typeof validateProvisionRequest>[0]> = {}) {
  return {
    callerUserId: "caller-1",
    callerCompanyId: BETA_COMPANY,
    isSuperAdmin: false,
    hasUsersEdit: true,
    requestedCompanyId: BETA_COMPANY,
    requestedRoleId: BETA_EMPLOYEE_ROLE,
    role: {
      id: BETA_EMPLOYEE_ROLE,
      company_id: BETA_COMPANY,
      is_system: false,
    },
    existingTargetProfile: null,
    ...overrides,
  };
}

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    console.error(`[FAIL] ${name}`);
    throw error;
  }
}

test("valid same-company role", () => {
  const result = validateProvisionRequest(baseInput());
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.effectiveCompanyId, BETA_COMPANY);
  }
});

test("company admin can assign same-company system role (RBAC unchanged)", () => {
  const result = validateProvisionRequest(
    baseInput({
      requestedRoleId: BETA_ADMIN_ROLE,
      role: {
        id: BETA_ADMIN_ROLE,
        company_id: BETA_COMPANY,
        is_system: true,
      },
    }),
  );
  assert.equal(result.ok, true);
});

test("role from another company", () => {
  const result = validateProvisionRequest(
    baseInput({
      requestedCompanyId: BETA_COMPANY,
      requestedRoleId: GAMMA_ADMIN_ROLE,
      role: {
        id: GAMMA_ADMIN_ROLE,
        company_id: GAMMA_COMPANY,
        is_system: true,
      },
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.auditReason, PROVISION_REJECTION.ROLE_TENANT_MISMATCH);
  }
});

test("fake companyId mismatch", () => {
  const result = validateProvisionRequest(
    baseInput({
      requestedCompanyId: GAMMA_COMPANY,
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.auditReason, PROVISION_REJECTION.COMPANY_ID_MISMATCH);
  }
});

test("cross-tenant system role assignment attempt", () => {
  const result = validateProvisionRequest(
    baseInput({
      requestedCompanyId: GAMMA_COMPANY,
      requestedRoleId: BETA_ADMIN_ROLE,
      role: {
        id: BETA_ADMIN_ROLE,
        company_id: BETA_COMPANY,
        is_system: true,
      },
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.auditReason, PROVISION_REJECTION.COMPANY_ID_MISMATCH);
  }
});

test("target user from another company", () => {
  const result = validateProvisionRequest(
    baseInput({
      existingTargetProfile: {
        id: "target-1",
        company_id: GAMMA_COMPANY,
        is_super_admin: false,
      },
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.auditReason, PROVISION_REJECTION.TARGET_USER_TENANT_MISMATCH);
  }
});

test("missing users.edit permission", () => {
  const result = validateProvisionRequest(
    baseInput({
      hasUsersEdit: false,
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.auditReason, PROVISION_REJECTION.MISSING_USERS_EDIT);
  }
});

test("super admin path with valid company and role", () => {
  const result = validateProvisionRequest(
    baseInput({
      isSuperAdmin: true,
      callerCompanyId: null,
      requestedCompanyId: GAMMA_COMPANY,
      requestedRoleId: GAMMA_ADMIN_ROLE,
      role: {
        id: GAMMA_ADMIN_ROLE,
        company_id: GAMMA_COMPANY,
        is_system: true,
      },
    }),
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.effectiveCompanyId, GAMMA_COMPANY);
  }
});

test("super admin rejects role/company tenant mismatch", () => {
  const result = validateProvisionRequest(
    baseInput({
      isSuperAdmin: true,
      callerCompanyId: null,
      requestedCompanyId: GAMMA_COMPANY,
      requestedRoleId: BETA_EMPLOYEE_ROLE,
      role: {
        id: BETA_EMPLOYEE_ROLE,
        company_id: BETA_COMPANY,
        is_system: false,
      },
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.auditReason, PROVISION_REJECTION.ROLE_TENANT_MISMATCH);
  }
});

test("non-super-admin cannot target super admin profile", () => {
  const result = validateProvisionRequest(
    baseInput({
      existingTargetProfile: {
        id: "platform-owner",
        company_id: null,
        is_super_admin: true,
      },
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.auditReason, PROVISION_REJECTION.TARGET_IS_SUPER_ADMIN);
  }
});

test("client companyId ignored for non-super-admin (uses caller company)", () => {
  const result = validateProvisionRequest(
    baseInput({
      requestedCompanyId: null,
      callerCompanyId: BETA_COMPANY,
    }),
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.effectiveCompanyId, BETA_COMPANY);
  }
});

test("intentional global role without company_id is allowed", () => {
  const result = validateProvisionRequest(
    baseInput({
      role: {
        id: "platform-role",
        company_id: null,
        is_system: true,
      },
      companyTenantRoleCount: 3,
    }),
  );
  assert.equal(result.ok, true);
});

test("company with zero tenant roles is rejected", () => {
  const result = validateProvisionRequest(
    baseInput({
      companyTenantRoleCount: 0,
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.auditReason, PROVISION_REJECTION.COMPANY_HAS_NO_ROLES);
  }
});

console.log("\nAll provision-user security unit tests passed.");
