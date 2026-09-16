import { describe, it } from "https://deno.land/std@0.224.0/testing/bdd.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  authorizeEmployeePasswordReset,
  EMPLOYEE_RESET_REJECTION,
  isUuid,
  validatePasswordPair,
} from "./validation.ts";

const TARGET = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COMPANY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("reset-employee-password validation", () => {
  it("enforces password policy", () => {
    assertEquals(validatePasswordPair("Abcdefg1", "Abcdefg2").ok, false);
    assertEquals(validatePasswordPair("short1A", "short1A").ok, false);
    assertEquals(validatePasswordPair("alllowercase1", "alllowercase1").ok, false);
    assertEquals(validatePasswordPair("TempReset2026!", "TempReset2026!").ok, true);
  });

  it("accepts valid uuids only", () => {
    assertEquals(isUuid(TARGET), true);
    assertEquals(isUuid("nope"), false);
  });

  it("denies callers without manage permission", () => {
    const result = authorizeEmployeePasswordReset({
      callerIsSuperAdmin: false,
      callerCompanyId: COMPANY,
      hasManagePermission: false,
      requestedCompanyId: COMPANY,
      targetUserId: TARGET,
      targetCompanyId: COMPANY,
      targetIsSuperAdmin: false,
      targetExists: true,
    });
    assertEquals(result.ok, false);
    if (!result.ok) assertEquals(result.reason, EMPLOYEE_RESET_REJECTION.MISSING_PERMISSION);
  });

  it("denies cross-tenant reset for company managers", () => {
    const result = authorizeEmployeePasswordReset({
      callerIsSuperAdmin: false,
      callerCompanyId: COMPANY,
      hasManagePermission: true,
      requestedCompanyId: COMPANY,
      targetUserId: TARGET,
      targetCompanyId: OTHER,
      targetIsSuperAdmin: false,
      targetExists: true,
    });
    assertEquals(result.ok, false);
    if (!result.ok) assertEquals(result.reason, EMPLOYEE_RESET_REJECTION.COMPANY_MISMATCH);
  });

  it("denies targeting a super admin unless caller is super admin", () => {
    const result = authorizeEmployeePasswordReset({
      callerIsSuperAdmin: false,
      callerCompanyId: COMPANY,
      hasManagePermission: true,
      requestedCompanyId: COMPANY,
      targetUserId: TARGET,
      targetCompanyId: COMPANY,
      targetIsSuperAdmin: true,
      targetExists: true,
    });
    assertEquals(result.ok, false);
    if (!result.ok) assertEquals(result.reason, EMPLOYEE_RESET_REJECTION.TARGET_IS_SUPER_ADMIN);
  });

  it("allows same-company manager reset", () => {
    const result = authorizeEmployeePasswordReset({
      callerIsSuperAdmin: false,
      callerCompanyId: COMPANY,
      hasManagePermission: true,
      requestedCompanyId: COMPANY,
      targetUserId: TARGET,
      targetCompanyId: COMPANY,
      targetIsSuperAdmin: false,
      targetExists: true,
    });
    assertEquals(result, { ok: true, effectiveCompanyId: COMPANY });
  });

  it("allows super admin to reset a tenant employee", () => {
    const result = authorizeEmployeePasswordReset({
      callerIsSuperAdmin: true,
      callerCompanyId: null,
      hasManagePermission: false,
      requestedCompanyId: COMPANY,
      targetUserId: TARGET,
      targetCompanyId: COMPANY,
      targetIsSuperAdmin: false,
      targetExists: true,
    });
    assertEquals(result, { ok: true, effectiveCompanyId: COMPANY });
  });
});
