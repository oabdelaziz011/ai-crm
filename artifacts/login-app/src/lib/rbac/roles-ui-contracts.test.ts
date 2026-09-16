/**
 * Roles page / Edit Role modal contracts.
 * Run: pnpm exec tsx --test src/lib/rbac/roles-ui-contracts.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const loginAppSrc = join(here, "../..");

describe("Roles UI contracts", () => {
  const dialog = readFileSync(join(loginAppSrc, "components/roles/role-form-dialog.tsx"), "utf8");
  const selector = readFileSync(join(loginAppSrc, "components/roles/role-form-fields.tsx"), "utf8");
  const page = readFileSync(join(loginAppSrc, "pages/roles.tsx"), "utf8");
  const label = readFileSync(join(loginAppSrc, "components/rbac/permission-badge.tsx"), "utf8");

  it("uses a large enterprise dialog with sticky chrome and a single permission scroller", () => {
    assert.match(dialog, /data-testid="role-form-dialog"/);
    assert.match(dialog, /max-w-\[80rem\]/);
    assert.match(dialog, /h-\[min\(92vh,56rem\)\]/);
    assert.match(dialog, /overflow-hidden/);
    assert.match(dialog, /RoleIdentityFields/);
    assert.match(dialog, /showIdentityFields=\{false\}/);
    assert.match(dialog, /buttons\.cancel/);
    assert.match(dialog, /buttons\.saveChanges/);
    assert.match(dialog, /readOnly/);
  });

  it("groups permissions by product family/module with search and select-all", () => {
    assert.match(selector, /groupPermissionsForRoleEditor/);
    assert.match(selector, /roles\.families\./);
    assert.match(selector, /data-permission-module/);
    assert.match(selector, /roles\.permissions\.searchPlaceholder/);
    assert.match(selector, /roles\.permissions\.selectAll/);
    assert.match(selector, /roles\.permissions\.clearAll/);
    assert.match(selector, /roles\.permissions\.moduleSelectAll/);
    assert.match(selector, /permissionSearchHaystack/);
    assert.match(selector, /dir="auto"/);
    assert.match(page, /RoleFormDialog/);
    assert.match(page, /RolesListTable/);
    assert.match(page, /scopeRolesToWorkspace/);
    assert.match(page, /isPlatformSuperAdminRole/);
    assert.doesNotMatch(selector, /😀|📡|📚/);
  });

  it("shows human label, description, and secondary permission code", () => {
    assert.match(selector, /showDescription/);
    assert.match(label, /dir="ltr"/);
    assert.match(label, /font-mono/);
  });
});
