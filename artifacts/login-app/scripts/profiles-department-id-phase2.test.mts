import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDepartmentMembershipWrite,
  formatDepartmentOptionLabel,
  resolveEmployeeDepartmentDisplay,
} from "../src/lib/organization/department-membership.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("Phase 2 department_id membership", () => {
  it("formats branch-aware labels so same-name departments stay distinct", () => {
    assert.equal(formatDepartmentOptionLabel("Support", "Branch A"), "Support — Branch A");
    assert.equal(formatDepartmentOptionLabel("Support", "Branch B"), "Support — Branch B");
    assert.notEqual(
      formatDepartmentOptionLabel("Support", "Branch A"),
      formatDepartmentOptionLabel("Support", "Branch B"),
    );
  });

  it("build write payload uses id and mirrors name", () => {
    const payload = buildDepartmentMembershipWrite("d1", [
      { id: "d1", name: "Support", branchName: "Main" },
      { id: "d2", name: "Support", branchName: "East" },
    ]);
    assert.deepEqual(payload, { department_id: "d1", department: "Support" });
  });

  it("empty selection writes nulls", () => {
    assert.deepEqual(buildDepartmentMembershipWrite("", []), {
      department_id: null,
      department: null,
    });
  });

  it("rejects unknown department ids (never resolve by name)", () => {
    assert.throws(() =>
      buildDepartmentMembershipWrite("missing", [{ id: "d1", name: "Support" }]),
    );
  });

  it("display prefers canonical department name over legacy text", () => {
    const map = new Map([["d1", { name: "Canonical", branchName: "HQ" }]]);
    assert.equal(
      resolveEmployeeDepartmentDisplay({
        departmentId: "d1",
        legacyDepartmentText: "Legacy",
        departmentsById: map,
      }),
      "Canonical",
    );
    assert.equal(
      resolveEmployeeDepartmentDisplay({
        departmentId: null,
        legacyDepartmentText: "LegacyOnly",
        departmentsById: map,
      }),
      "LegacyOnly",
    );
  });

  it("DepartmentSearchableSelect persists ids not names", () => {
    const src = readFileSync(
      resolve(root, "artifacts/login-app/src/components/users/department-searchable-select.tsx"),
      "utf8",
    );
    assert.match(src, /onChange:\s*\(departmentId:\s*string\)\s*=>\s*void/);
    assert.match(src, /value:\s*d\.id/);
    assert.doesNotMatch(src, /value:\s*d\.name/);
  });

  it("invite/edit/bulk write department_id", () => {
    const invite = readFileSync(
      resolve(root, "artifacts/login-app/src/components/users/invite-managed-user-dialog.tsx"),
      "utf8",
    );
    const edit = readFileSync(
      resolve(root, "artifacts/login-app/src/components/users/edit-managed-user-dialog.tsx"),
      "utf8",
    );
    const bulk = readFileSync(
      resolve(
        root,
        "artifacts/login-app/src/components/company-workspace/employees/employee-bulk-assign-dialog.tsx",
      ),
      "utf8",
    );
    assert.match(invite, /departmentId:\s*membership\.department_id/);
    assert.match(edit, /department_id:\s*membership\.department_id/);
    assert.match(bulk, /department_id:\s*membership\.department_id/);
  });

  it("provision-user validates department company and writes department_id", () => {
    const src = readFileSync(resolve(root, "supabase/functions/provision-user/index.ts"), "utf8");
    assert.match(src, /departmentId/);
    assert.match(src, /department_id:\s*departmentId/);
    assert.match(src, /department_company_mismatch|same company/i);
  });

  it("update_my_profile migration 368 sets department membership flag", () => {
    const sql = readFileSync(
      resolve(root, "supabase/migrations/368_update_my_profile_department_id.sql"),
      "utf8",
    );
    assert.match(sql, /p_set_department_membership/);
    assert.match(sql, /p_department_id uuid/);
    assert.doesNotMatch(sql, /conversation\.assign/i);
  });

  it("Arabic and English department UI keys still present", () => {
    const en = readFileSync(
      resolve(root, "artifacts/login-app/src/locales/en/common.json"),
      "utf8",
    );
    const ar = readFileSync(
      resolve(root, "artifacts/login-app/src/locales/ar/common.json"),
      "utf8",
    );
    assert.match(en, /"department"/);
    assert.match(ar, /"department"/);
    assert.match(en, /departmentNone|departmentSelectPlaceholder/);
    assert.match(ar, /departmentNone|departmentSelectPlaceholder/);
  });

  it("edit dialog sets dir for RTL", () => {
    const edit = readFileSync(
      resolve(root, "artifacts/login-app/src/components/users/edit-managed-user-dialog.tsx"),
      "utf8",
    );
    assert.match(edit, /dir=\{.*startsWith\("ar"\).*rtl.*ltr/);
  });
});
