import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("Department UI compatibility (Phase 2)", () => {
  it("DepartmentSearchableSelect persists canonical department id", () => {
    const src = readFileSync(
      resolve(root, "artifacts/login-app/src/components/users/department-searchable-select.tsx"),
      "utf8",
    );
    assert.match(src, /onChange:\s*\(departmentId:\s*string\)\s*=>\s*void/);
    assert.match(src, /value:\s*d\.id/);
    assert.match(src, /formatDepartmentOptionLabel/);
  });

  it("employee create/update paths accept departmentId / department_id", () => {
    const users = readFileSync(
      resolve(root, "artifacts/login-app/src/hooks/use-users-management.ts"),
      "utf8",
    );
    assert.match(users, /departmentId\?:\s*string\s*\|\s*null/);
    assert.match(users, /department_id\?:\s*string\s*\|\s*null/);
    assert.match(users, /departmentId:\s*input\.departmentId/);
  });

  it("organization repository remaps by department_id on rename/deps without dropping text", () => {
    const repo = readFileSync(
      resolve(root, "artifacts/login-app/src/lib/organization/repositories/organization-repository.ts"),
      "utf8",
    );
    assert.match(repo, /\.eq\("department_id",\s*id\)/);
    assert.match(repo, /select\("department,\s*department_id"\)/);
    assert.match(repo, /\.ilike\("department"/);
  });
});
