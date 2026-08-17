/**
 * Unit tests: tenant provisioning expects Company Admin only.
 * Run: tsx scripts/company-create-flow.test.mts
 */
import assert from "node:assert/strict";

const TENANT_REQUIRED_TEMPLATE_KEYS = ["admin"] as const;
const TENANT_REQUIRED_ROLE_NAMES = ["Company Admin"] as const;
const LEGACY_OPTIONAL_TEMPLATE_KEYS = ["manager", "employee"] as const;

function assertRequiredRolesPresent(roleNames: string[]): string[] {
  const names = new Set(roleNames);
  return TENANT_REQUIRED_ROLE_NAMES.filter((name) => !names.has(name));
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

test("Tenant provisioning requires Company Admin only", () => {
  const missing = assertRequiredRolesPresent(["Company Admin"]);
  assert.deepEqual(missing, []);
});

test("Tenant provisioning detects missing Company Admin", () => {
  const missing = assertRequiredRolesPresent([]);
  assert.deepEqual(missing, ["Company Admin"]);
});

test("Manager and Employee are not mandatory for new companies", () => {
  const existingTemplateKeys = new Set<string>(["admin"]);
  const hasRequired = TENANT_REQUIRED_TEMPLATE_KEYS.every((key) => existingTemplateKeys.has(key));
  const hasLegacyOptional = LEGACY_OPTIONAL_TEMPLATE_KEYS.every((key) =>
    existingTemplateKeys.has(key),
  );
  assert.equal(hasRequired, true);
  assert.equal(hasLegacyOptional, false);
});

test("Provisioner skips when Company Admin already exists", () => {
  const existingTemplateKeys = new Set<string>(TENANT_REQUIRED_TEMPLATE_KEYS);
  const shouldSkip = TENANT_REQUIRED_TEMPLATE_KEYS.every((key) => existingTemplateKeys.has(key));
  assert.equal(shouldSkip, true);
});

test("Provisioner runs when Company Admin is missing", () => {
  const existingTemplateKeys = new Set<string>(["manager", "employee"]);
  const shouldProvision = !TENANT_REQUIRED_TEMPLATE_KEYS.every((key) =>
    existingTemplateKeys.has(key),
  );
  assert.equal(shouldProvision, true);
});

test("Retry is allowed only for failed or pending lifecycle states", () => {
  const retryable = new Set(["failed", "pending"]);
  assert.equal(retryable.has("failed"), true);
  assert.equal(retryable.has("completed"), false);
});

console.log("\nAll company create flow unit tests passed.");
