/**
 * Custom company commercial package (Change Package → Custom).
 * Run: npx tsx --tsconfig tsconfig.json scripts/company-custom-package.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CUSTOM_FEATURE_GROUPS,
  CUSTOM_PACKAGE_SENTINEL,
  PERIODIC_QUOTA_METRIC_CODES,
  isOverLimit,
  parseNonNegativeNumber,
  quotaControlKind,
  remainingFromLimit,
  resolveDisplayedPackageLabel,
  localizedFeatureLabel,
} from "../src/lib/billing/custom-package-config.ts";

const here = dirname(fileURLToPath(import.meta.url));
const ar = JSON.parse(readFileSync(join(here, "../src/locales/ar/common.json"), "utf8"));
const en = JSON.parse(readFileSync(join(here, "../src/locales/en/common.json"), "utf8"));
const sql = readFileSync(join(here, "../../../supabase/migrations/311_configure_company_custom_package.sql"), "utf8");
const sql312 = readFileSync(
  join(here, "../../../supabase/migrations/312_fix_package_change_audit_preserved_features.sql"),
  "utf8",
);
const featuresDialog = readFileSync(
  join(here, "../src/components/companies/company-features-access-dialog.tsx"),
  "utf8",
);
const catalogDisplay = readFileSync(
  join(here, "../src/lib/billing/company-feature-catalog-display.ts"),
  "utf8",
);
const dialog = readFileSync(
  join(here, "../src/components/billing/dialogs/billing-change-package-dialog.tsx"),
  "utf8",
);
const panel = readFileSync(
  join(here, "../src/components/billing/dialogs/billing-custom-package-panel.tsx"),
  "utf8",
);
const billingEdit = readFileSync(join(here, "../src/hooks/billing/use-billing-edit.ts"), "utf8");
const tAr = (key: string) => {
  const parts = key.split(".");
  let cur: unknown = ar;
  for (const part of parts) {
    if (!cur || typeof cur !== "object" || !(part in cur)) return "";
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === "string" ? cur : "";
};

console.log("\nCompany custom package\n");

assert.equal(ar.companies.changePackage.title, "تغيير الباقة");
assert.equal(ar.companies.changePackage.customPackage, "باقة مخصصة");
assert.equal(ar.companies.changePackage.currentPackage, "الباقة الحالية");
assert.equal(ar.companies.changePackage.newPackage, "الباقة الجديدة");
assert.equal(ar.companies.changePackage.monthly, "شهري");
assert.equal(ar.companies.changePackage.yearly, "سنوي");
assert.equal(ar.companies.changePackage.noPayment, "لا يتم تحصيل أي دفعة من خلال هذا الإجراء.");
assert.equal(en.companies.changePackage.customPackage, "Custom package");
assert.ok(tAr("companies.changePackage.metrics.ai_email_routing").length > 0);
assert.ok(tAr("companies.changePackage.metrics.api_calls").length > 0);
console.log("  ✓ Arabic/English labels exist");

assert.match(dialog, /CUSTOM_PACKAGE_SENTINEL/);
assert.match(dialog, /BillingCustomPackagePanel/);
assert.match(dialog, /change_company_package_v1|useChangeCompanyPackage/);
assert.match(panel, /configure_company_custom_package_v1|useConfigureCompanyCustomPackage/);
assert.match(billingEdit, /configure_company_custom_package_v1/);
assert.match(billingEdit, /change_company_package_v1/);
assert.match(billingEdit, /convert_trial_to_paid_v1/);
console.log("  ✓ Custom option is wired; catalog/trial RPCs remain");

assert.equal(CUSTOM_PACKAGE_SENTINEL, "__custom__");
assert.ok(CUSTOM_FEATURE_GROUPS.some((group) => group.codes.includes("leads")));
assert.ok(CUSTOM_FEATURE_GROUPS.some((group) => group.codes.includes("ai_employee")));
assert.ok(CUSTOM_FEATURE_GROUPS.some((group) => group.codes.includes("whatsapp_channel")));
assert.ok(PERIODIC_QUOTA_METRIC_CODES.includes("ai_email_routing"));
assert.ok(PERIODIC_QUOTA_METRIC_CODES.includes("ai_employee_email"));
assert.ok(PERIODIC_QUOTA_METRIC_CODES.includes("api_calls"));
assert.ok(PERIODIC_QUOTA_METRIC_CODES.includes("whatsapp_messages"));
assert.ok(PERIODIC_QUOTA_METRIC_CODES.includes("ai_tokens"));
assert.ok(PERIODIC_QUOTA_METRIC_CODES.includes("emails_sent"));
assert.ok(PERIODIC_QUOTA_METRIC_CODES.includes("sms_sent"));
assert.ok(PERIODIC_QUOTA_METRIC_CODES.includes("storage_bytes"));
assert.equal(quotaControlKind({ code: "storage_bytes", aggregationType: "gauge" }), "informational");
assert.equal(quotaControlKind({ code: "api_calls", billable: true }), "numeric");
assert.equal(parseNonNegativeNumber("-1"), null);
assert.equal(parseNonNegativeNumber("12"), 12);
assert.equal(remainingFromLimit(8, 10, false), 2);
assert.equal(isOverLimit(12, 10, false), true);
assert.equal(isOverLimit(12, 10, true), false);
console.log("  ✓ Feature/quota mapping and limit math");

assert.match(sql, /create or replace function public.configure_company_custom_package_v1/);
assert.match(sql, /is_super_admin\(\)/);
assert.match(sql, /convert_trial_to_paid_v1/);
assert.match(sql, /'contract'/);
assert.match(sql, /pricing_source = 'custom'/);
assert.match(sql, /_upsert_company_resource_limits/);
assert.match(sql, /company_usage_limit_overrides/);
assert.match(sql, /payment_collected.*, false/);
assert.match(sql, /internal.change_company_package_v1/);
assert.match(sql, /_reset_company_custom_commercial_overlay/);
assert.match(sql, /source = 'contract'/);
assert.match(sql, /source = 'package'/);
assert.match(sql, /custom_granted_feature_codes/);
assert.match(sql, /'system', 'manual', 'trial'/);
assert.match(sql, /write_billing_audit_log/);
assert.ok(ar.companies.changePackage.featureLabels.ticketing === "التذاكر");
assert.ok(ar.companies.changePackage.featureLabels.ai_employee === "الموظف الذكي");
assert.ok(ar.companies.changePackage.featureLabels.whatsapp_channel === "واتساب");
assert.match(panel, /localizedFeatureLabel/);
assert.doesNotMatch(sql, /insert into public.plans/);
assert.doesNotMatch(dialog, /checkout|stripe|collectPayment/i);
console.log("  ✓ Transactional Super-Admin RPC; no catalog plan insert; no payment");

const fakeT = (key: string) => key;
assert.equal(
  resolveDisplayedPackageLabel(fakeT as never, { hasSubscription: false }),
  "companies.changePackage.noSubscription",
);
assert.equal(
  resolveDisplayedPackageLabel(fakeT as never, {
    hasSubscription: true,
    terms: { pricing_source: "custom", custom_package_name: "عقد خاص", company_id: "x", discount_percent: 0, custom_price_monthly: 1, custom_price_yearly: 1, notes: null },
  }),
  "عقد خاص",
);
console.log("  ✓ Display label prefers custom configuration over unassigned plan");

assert.match(sql312, /_reset_company_custom_commercial_overlay/);
assert.match(sql312, /preserved_non_package_features/);
assert.match(sql312, /source in \('manual', 'contract', 'system'\)/);
assert.match(sql312, /update public.billing_audit_logs/);
assert.doesNotMatch(sql312, /insert into public.billing_audit_logs/);
const overlayAt = sql312.indexOf("_reset_company_custom_commercial_overlay");
const preservedAt = sql312.indexOf("array_agg(o.feature_code");
assert.ok(overlayAt >= 0 && preservedAt > overlayAt);
assert.match(featuresDialog, /localizedFeatureLabel/);
assert.match(featuresDialog, /companies\.changePackage\.featureLabels|localizedFeatureLabel/);
assert.equal(localizedFeatureLabel(((key: string) => key === "companies.changePackage.featureLabels.ticketing" ? "التذاكر" : key) as never, "ticketing", "Ticketing"), "التذاكر");
const catalogCodes = [
  "customers", "leads", "opportunities", "bookings", "operations", "ticketing", "finance",
  "ai_employee", "ai_assistant", "ai_email_routing", "ai_ticketing", "ai_suggested_replies",
  "workflow_automation", "omnichannel", "whatsapp_channel", "facebook_channel", "instagram_channel",
  "email_channel", "sms_channel", "basic_reports", "advanced_reports", "api_access",
  "administration", "users_roles", "company_settings", "security_audit",
];
for (const code of catalogCodes) {
  assert.ok(ar.companies.changePackage.featureLabels[code], `missing ar label ${code}`);
  assert.ok(en.companies.changePackage.featureLabels[code], `missing en label ${code}`);
  assert.match(catalogDisplay, new RegExp(`"${code}"`));
}
assert.equal(ar.companies.changePackage.featureLabels.leads, "العملاء المحتملون");
assert.doesNotMatch(ar.companies.changePackage.featureLabels.leads, /[A-Za-z]/);
console.log("  ✓ Audit metadata is finalized after overlay reset; Arabic feature labels exist");
console.log("\nCompany custom package tests passed.\n");
