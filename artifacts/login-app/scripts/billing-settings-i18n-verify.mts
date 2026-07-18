/**
 * Verifies Billing Settings page strings resolve in Arabic without English fallbacks.
 * Run: npm run test:billing-settings-i18n
 */
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const win = new Window();
(globalThis as { window?: Window; document?: Document; localStorage?: Storage }).window = win;
(globalThis as { window?: Window; document?: Document; localStorage?: Storage }).document = win.document;
(globalThis as { window?: Window; document?: Document; localStorage?: Storage }).localStorage = win.localStorage;

localStorage.setItem("app.language", "ar");

const i18n = (await import("../src/i18n")).default;
await i18n.changeLanguage("ar");

const fieldCodes = Object.keys(
  JSON.parse(readFileSync(join(root, "src/locales/ar/billing-settings-fields.json"), "utf8")).fields,
);

console.log("\nBilling settings Arabic i18n verification\n");

const tabs = [
  "general",
  "subscription",
  "documents",
  "branding",
  "payments",
  "communications",
  "webhooks",
  "usage",
  "health",
  "entitlements",
];

for (const tab of tabs) {
  const label = i18n.t(`billing.settings.tabs.${tab}`);
  assert.notEqual(label, `billing.settings.tabs.${tab}`);
  assert.match(label, /[\u0600-\u06FF]/, `tab ${tab} not Arabic: ${label}`);
  console.log(`  ✓ tab/${tab}: ${label}`);
}

for (const code of fieldCodes) {
  const label = i18n.t(`billing.settings.fields.${code}.label`);
  const description = i18n.t(`billing.settings.fields.${code}.description`);
  const tooltip = i18n.t(`billing.settings.fields.${code}.tooltip`);
  assert.notEqual(label, `billing.settings.fields.${code}.label`, code);
  assert.match(label, /[\u0600-\u06FF]|JSON|PayPal|Stripe|Apple Pay|Google Pay|USD|cron|PDF|billing_email_templates|{YYYY}/, code);
  assert.match(description, /[\u0600-\u06FF]/, `${code} description`);
  assert.match(tooltip, /[\u0600-\u06FF]/, `${code} tooltip`);
}

console.log(`  ✓ ${fieldCodes.length} field labels/descriptions/tooltips in Arabic`);

assert.match(i18n.t("billing.settings.save"), /[\u0600-\u06FF]/);
assert.match(i18n.t("billing.settings.validation.fixErrors"), /[\u0600-\u06FF]/);
assert.match(i18n.t("billing.payment.methodLabel"), /[\u0600-\u06FF]/);
console.log("  ✓ shell + payment dialog strings in Arabic");

console.log("\n✓ Billing Settings Arabic localization verified.\n");
