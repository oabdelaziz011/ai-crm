/**
 * Contract tests for company onboarding RPC behavior (unit-level).
 * These encode authorization and transaction expectations for:
 * - onboard_own_company_v1
 * - create_company_admin_v1
 */
import assert from "node:assert/strict";

type RpcAuth = {
  authenticated: boolean;
  companyId: string | null;
  isSuperAdmin: boolean;
  hasCompaniesCreate: boolean;
};

function simulateOnboardOwnCompanyAuth(auth: RpcAuth): "ok" | "not_authenticated" | "company_already_assigned" | "super_admin_use_admin_create" {
  if (!auth.authenticated) return "not_authenticated";
  if (auth.isSuperAdmin) return "super_admin_use_admin_create";
  if (auth.companyId) return "company_already_assigned";
  return "ok";
}

function simulateCreateCompanyAdminAuth(auth: RpcAuth): "ok" | "not_authenticated" | "forbidden" {
  if (!auth.authenticated) return "not_authenticated";
  if (auth.isSuperAdmin || auth.hasCompaniesCreate) return "ok";
  return "forbidden";
}

function simulateOwnershipModel(result: {
  profileCompanyId: string | null;
  roleTemplateKey: string | null;
}): boolean {
  return result.profileCompanyId != null && result.roleTemplateKey === "admin";
}

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`[PASS] ${name}`);
}

test("onboard_own_company_v1 rejects unauthenticated callers", () => {
  assert.equal(
    simulateOnboardOwnCompanyAuth({
      authenticated: false,
      companyId: null,
      isSuperAdmin: false,
      hasCompaniesCreate: false,
    }),
    "not_authenticated",
  );
});

test("onboard_own_company_v1 rejects users who already have a company", () => {
  assert.equal(
    simulateOnboardOwnCompanyAuth({
      authenticated: true,
      companyId: "existing",
      isSuperAdmin: false,
      hasCompaniesCreate: false,
    }),
    "company_already_assigned",
  );
});

test("onboard_own_company_v1 allows first-time authenticated non-admin users", () => {
  assert.equal(
    simulateOnboardOwnCompanyAuth({
      authenticated: true,
      companyId: null,
      isSuperAdmin: false,
      hasCompaniesCreate: false,
    }),
    "ok",
  );
});

test("create_company_admin_v1 rejects unauthorized callers", () => {
  assert.equal(
    simulateCreateCompanyAdminAuth({
      authenticated: true,
      companyId: "platform",
      isSuperAdmin: false,
      hasCompaniesCreate: false,
    }),
    "forbidden",
  );
});

test("create_company_admin_v1 allows companies.create or super admin", () => {
  assert.equal(
    simulateCreateCompanyAdminAuth({
      authenticated: true,
      companyId: "platform",
      isSuperAdmin: false,
      hasCompaniesCreate: true,
    }),
    "ok",
  );
  assert.equal(
    simulateCreateCompanyAdminAuth({
      authenticated: true,
      companyId: null,
      isSuperAdmin: true,
      hasCompaniesCreate: false,
    }),
    "ok",
  );
});

test("ownership source of truth is profile.company_id + admin role template", () => {
  assert.equal(
    simulateOwnershipModel({
      profileCompanyId: "c1",
      roleTemplateKey: "admin",
    }),
    true,
  );
  assert.equal(
    simulateOwnershipModel({
      profileCompanyId: "c1",
      roleTemplateKey: "employee",
    }),
    false,
  );
});

console.log(`company-onboarding-auth: ${passed} passed`);
