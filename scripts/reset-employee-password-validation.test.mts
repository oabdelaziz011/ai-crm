import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  authorizeEmployeePasswordReset,
  EMPLOYEE_RESET_REJECTION,
  isUuid,
  validatePasswordPair,
} from "../supabase/functions/reset-employee-password/validation.ts";

const here = dirname(fileURLToPath(import.meta.url));
const TARGET = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COMPANY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("reset-employee-password validation (node)", () => {
  it("stays in sync with the edge validation source", () => {
    const edge = readFileSync(
      resolve(here, "../supabase/functions/reset-employee-password/validation.ts"),
      "utf8",
    );
    assert.match(edge, /password\.length < 8/);
    assert.match(edge, /password_mismatch/);
    assert.match(edge, /employees\.manage|MISSING_PERMISSION/);
    assert.match(edge, /TARGET_IS_SUPER_ADMIN/);
  });

  it("enforces password policy", () => {
    assert.deepEqual(validatePasswordPair("Abcdefg1", "Abcdefg2"), {
      ok: false,
      code: "password_mismatch",
    });
    assert.equal(validatePasswordPair("short1A", "short1A").ok, false);
    assert.deepEqual(validatePasswordPair("alllowercase1", "alllowercase1"), {
      ok: false,
      code: "password_policy",
    });
    assert.deepEqual(validatePasswordPair("TempReset2026!", "TempReset2026!"), { ok: true });
    assert.equal(isUuid(TARGET), true);
    assert.equal(isUuid("nope"), false);
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
    assert.deepEqual(result, { ok: false, reason: EMPLOYEE_RESET_REJECTION.MISSING_PERMISSION });
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
    assert.deepEqual(result, { ok: false, reason: EMPLOYEE_RESET_REJECTION.COMPANY_MISMATCH });
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
    assert.deepEqual(result, { ok: false, reason: EMPLOYEE_RESET_REJECTION.TARGET_IS_SUPER_ADMIN });
  });

  it("allows same-company manager reset and super-admin tenant reset", () => {
    assert.deepEqual(
      authorizeEmployeePasswordReset({
        callerIsSuperAdmin: false,
        callerCompanyId: COMPANY,
        hasManagePermission: true,
        requestedCompanyId: COMPANY,
        targetUserId: TARGET,
        targetCompanyId: COMPANY,
        targetIsSuperAdmin: false,
        targetExists: true,
      }),
      { ok: true, effectiveCompanyId: COMPANY },
    );
    assert.deepEqual(
      authorizeEmployeePasswordReset({
        callerIsSuperAdmin: true,
        callerCompanyId: null,
        hasManagePermission: false,
        requestedCompanyId: COMPANY,
        targetUserId: TARGET,
        targetCompanyId: COMPANY,
        targetIsSuperAdmin: false,
        targetExists: true,
      }),
      { ok: true, effectiveCompanyId: COMPANY },
    );
  });
});
