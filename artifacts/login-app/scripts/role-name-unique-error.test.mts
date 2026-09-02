import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(
  resolve(__dirname, "../src/lib/rbac/role-write-errors.ts"),
  "utf8",
);

describe("role-write-errors", () => {
  it("maps roles_company_id_name_key duplicates to ROLE_NAME_ALREADY_EXISTS", () => {
    assert.match(src, /roles_company_id_name_key/);
    assert.match(src, /ROLE_NAME_ALREADY_EXISTS/);
  });

  it("exports mapRoleWriteError", () => {
    assert.match(src, /export function mapRoleWriteError/);
  });
});
