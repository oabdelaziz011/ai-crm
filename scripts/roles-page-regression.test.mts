/**
 * Roles page UX regression checks.
 * Run: tsx scripts/roles-page-regression.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function read(rel: string) {
  return readFileSync(resolve(root, rel), "utf8");
}

const rolesSource = read("artifacts/login-app/src/pages/roles.tsx");
const formFieldsSource = read("artifacts/login-app/src/components/roles/role-form-fields.tsx");
const formDialogSource = read("artifacts/login-app/src/components/roles/role-form-dialog.tsx");

assert.match(rolesSource, /RoleFormDialog/, "Roles page must use shared RoleFormDialog");
assert.match(rolesSource, /createDialogOpen/, "Create role must use dialog state");
assert.doesNotMatch(rolesSource, /forms\.roles\.create[\s\S]*Card/, "Static create panel must be removed");
assert.match(rolesSource, /roles\.createRole/, "Create Role button label");
assert.match(rolesSource, /flex-row-reverse[\s\S]*rtl:flex-row/, "RTL-aware create button placement");
assert.match(rolesSource, /fetchRolePermissionCodes/, "Edit flow must load existing permissions");
assert.match(rolesSource, /<AlertDialog[\s\S]*deleteDialog\.open/, "Delete confirmation dialog must gate deletion");
assert.doesNotMatch(
  rolesSource,
  /onClick=\{\(\) => deleteRole\.mutate\(role\.id\)\}/,
  "Delete must not call mutate directly from row button",
);

assert.match(formFieldsSource, /RolePermissionSelector/, "Permission selector component must exist");
assert.match(formFieldsSource, /selectAll/, "Global select all");
assert.match(formFieldsSource, /clearAll/, "Clear all button");
assert.match(formFieldsSource, /expandAll/, "Expand all");
assert.match(formFieldsSource, /collapseAll/, "Collapse all");
assert.match(formFieldsSource, /Accordion/, "Permission groups use accordion");
assert.match(formFieldsSource, /indeterminate|"indeterminate"/, "Tri-state checkbox support");
assert.match(formFieldsSource, /selectedCounter/, "Permission counter");
assert.match(formFieldsSource, /groupCounter/, "Group counter");
assert.match(formFieldsSource, /onKeyDown/, "Keyboard handler on permission area");
assert.match(formFieldsSource, /ctrlKey/, "Ctrl+A shortcut");

assert.match(formDialogSource, /RoleFormFields/, "Dialog reuses RoleFormFields");
assert.match(formDialogSource, /sticky bottom-0/, "Sticky dialog footer");

console.log("[PASS] roles page enterprise UX wiring");
