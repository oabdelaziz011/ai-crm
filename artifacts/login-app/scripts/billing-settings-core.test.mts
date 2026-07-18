/**
 * Core billing settings runtime unit tests + i18n completeness.
 * Run: npm run test:billing-settings-core
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeGracePeriodEndsAt,
  computeInvoiceDueAt,
  computeTrialEndsAt,
  filterSupportedPaymentMethods,
  parseSupportedPaymentMethodCodes,
  resolveActivePaymentMode,
  resolveActivePaymentProvider,
} from "../src/lib/billing/settings-runtime";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

console.log("\nBilling settings core tests\n");

const issued = new Date("2026-07-18T00:00:00.000Z");
const due = computeInvoiceDueAt(issued, 30);
assert.equal(due.toISOString(), "2026-08-17T00:00:00.000Z");
console.log("  ✓ payment terms due date");

const trialEnd = computeTrialEndsAt(issued, 14);
assert.equal(trialEnd.toISOString(), "2026-08-01T00:00:00.000Z");
console.log("  ✓ trial duration end date");

const graceEnd = computeGracePeriodEndsAt(issued, 7);
assert.equal(graceEnd.toISOString(), "2026-07-25T00:00:00.000Z");
console.log("  ✓ grace period end date");

assert.equal(resolveActivePaymentProvider(true), "sandbox");
assert.equal(resolveActivePaymentProvider(false), "manual");
assert.equal(resolveActivePaymentMode(true), "sandbox");
assert.equal(resolveActivePaymentMode(false), "production");
console.log("  ✓ sandbox provider routing");

const methods = filterSupportedPaymentMethods(
  ["manual", "visa"],
  [
    { code: "manual", display_name: "Manual", category: "offline" },
    { code: "visa", display_name: "Visa", category: "card" },
    { code: "stripe", display_name: "Stripe", category: "gateway" },
  ],
);
assert.deepEqual(methods.map((m) => m.code), ["manual", "visa"]);
console.log("  ✓ supported payment method filter");

assert.deepEqual(parseSupportedPaymentMethodCodes('["manual","visa"]'), ["manual", "visa"]);
console.log("  ✓ parse supported payment method codes");

const CORE_SETTINGS = [
  "grace_period_days",
  "trial_duration_days",
  "auto_renewal_default",
  "default_payment_terms_days",
  "supported_payment_method_codes",
  "payment_sandbox_mode",
];

const enFields = JSON.parse(
  readFileSync(join(root, "src/locales/en/billing-settings-fields.json"), "utf8"),
) as { fields: Record<string, { label: string; description: string; tooltip: string }> };
const arFields = JSON.parse(
  readFileSync(join(root, "src/locales/ar/billing-settings-fields.json"), "utf8"),
) as { fields: Record<string, { label: string; description: string; tooltip: string }> };

for (const code of CORE_SETTINGS) {
  assert.ok(enFields.fields[code]?.label, `missing EN label for ${code}`);
  assert.ok(arFields.fields[code]?.label, `missing AR label for ${code}`);
  assert.ok(arFields.fields[code]?.description, `missing AR description for ${code}`);
}
console.log("  ✓ core setting locale keys present");

const arJson = readFileSync(join(root, "src/locales/ar/billing-settings-fields.json"), "utf8");
const forbiddenEnglish = [
  "Default Currency",
  "Grace Period Duration",
  "Payment Sandbox Mode",
  "Supported Payment Methods",
  "Save settings",
  "General",
];
for (const phrase of forbiddenEnglish) {
  assert.equal(arJson.includes(phrase), false, `Arabic locale contains English phrase: ${phrase}`);
}
console.log("  ✓ Arabic settings locale has no forbidden English phrases");

console.log("\nAll billing settings core checks passed.\n");
