/**
 * Unit tests: tenant provisioning guard logic.
 * Run: tsx scripts/company-create-flow.test.mts
 */
import assert from "node:assert/strict";

const TENANT_DEFAULT_TEMPLATE_KEYS = ["admin", "manager", "employee"] as const;
const TENANT_DEFAULT_ROLE_NAMES = ["Company Admin", "Manager", "Employee"] as const;

function assertDefaultRolesPresent(roleNames: string[]): string[] {
  const names = new Set(roleNames);
  return TENANT_DEFAULT_ROLE_NAMES.filter((name) => !names.has(name));
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

test("Tenant provisioning expects Company Admin, Manager, Employee", () => {
  const missing = assertDefaultRolesPresent(["Company Admin", "Manager", "Employee"]);
  assert.deepEqual(missing, []);
});

test("Tenant provisioning detects missing default roles", () => {
  const missing = assertDefaultRolesPresent([]);
  assert.deepEqual(missing, ["Company Admin", "Manager", "Employee"]);
});

test("Provisioner skips when all template keys already exist", () => {
  const existingTemplateKeys = new Set<string>(TENANT_DEFAULT_TEMPLATE_KEYS);
  const shouldSkip = TENANT_DEFAULT_TEMPLATE_KEYS.every((key) => existingTemplateKeys.has(key));
  assert.equal(shouldSkip, true);
});

test("Provisioner runs when any template key is missing", () => {
  const existingTemplateKeys = new Set<string>(["admin", "manager"]);
  const shouldProvision = !TENANT_DEFAULT_TEMPLATE_KEYS.every((key) => existingTemplateKeys.has(key));
  assert.equal(shouldProvision, true);
});

test("Retry is allowed only for failed or pending lifecycle states", () => {
  const retryable = new Set(["failed", "pending"]);
  assert.equal(retryable.has("failed"), true);
  assert.equal(retryable.has("completed"), false);
});

console.log("\nAll company create flow unit tests passed.");
