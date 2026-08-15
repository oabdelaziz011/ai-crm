/**
 * Part 4 — Company Payment Portal.
 * Run: npx --yes tsx --test scripts/company-payment-portal.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Part 4 company payment portal", () => {
  const tab = read("src/components/company-workspace/tabs/company-subscription-tab.tsx");
  const panel = read("src/components/company-workspace/company-saas-payment-panel.tsx");
  const api = read("src/lib/billing/saas-checkout-api.ts");
  const hook = read("src/hooks/billing/use-saas-checkout.ts");
  const perms = read("src/lib/company-workspace/permissions.ts");
  const en = read("src/locales/en/common.json");
  const ar = read("src/locales/ar/common.json");

  it("mounts payment panel on subscription tab for authenticated company", () => {
    assert.match(tab, /CompanySaasPaymentPanel/);
    assert.match(tab, /companyId=\{companyId\}/);
    assert.match(tab, /Tenant isolation/);
  });

  it("uses existing Part 2 checkout endpoint only", () => {
    assert.match(api, /\/billing\/saas\/checkout/);
    assert.match(api, /returnUrl/);
    assert.doesNotMatch(api, /amount:\s*input/);
    assert.doesNotMatch(api, /p_amount/);
    assert.match(api, /omit amount\/currency\/companyId|Intentionally omit amount/);
  });

  it("validates checkout amount/currency against display before redirect", () => {
    assert.match(hook, /expectedAmount/);
    assert.match(hook, /CHECKOUT_AMOUNT_MISMATCH/);
    assert.match(hook, /CHECKOUT_CURRENCY_MISMATCH/);
    assert.match(hook, /storePendingCheckoutSession/);
  });

  it("Pay requires canInitiateCompanyOnlinePayment (update), not view-only", () => {
    assert.match(perms, /canInitiateCompanyOnlinePayment/);
    assert.match(perms, /canUpdateCompany\(access\)/);
    assert.match(panel, /canInitiateCompanyOnlinePayment/);
  });

  it("double-click protection via pending + stable idempotency", () => {
    assert.match(panel, /createCheckout\.isPending/);
    assert.match(panel, /idempotencyRef/);
    assert.match(panel, /disabled=\{createCheckout\.isPending\}/);
  });

  it("return does not trust success query params", () => {
    assert.match(panel, /payment_return/);
    assert.doesNotMatch(panel, /success=true|paid=true|status=success/);
    assert.match(panel, /derivePortalPaymentReturnState/);
    assert.match(panel, /returnProcessing/);
  });

  it("does not settle from the browser", () => {
    assert.doesNotMatch(panel, /settle_saas_verified_payment|renew_subscription_from_payment/);
    assert.doesNotMatch(api, /settle_saas_verified_payment/);
    assert.doesNotMatch(tab, /\.from\([\"']billing_payments/);
  });

  it("EN/AR payment strings exist", () => {
    assert.match(en, /"payNow": "Pay now"/);
    assert.match(en, /"returnProcessing"/);
    assert.match(ar, /"payNow": "ادفع الآن"/);
    assert.match(ar, /"returnProcessing"/);
  });

  it("still does not expose platform billing mutations", () => {
    assert.doesNotMatch(tab, /BillingRecordPaymentDialog/);
    assert.doesNotMatch(tab, /useRecordSubscriptionPayment/);
    assert.doesNotMatch(tab, /convert_trial_to_paid_v1/);
    assert.doesNotMatch(tab, /change_company_package_v1/);
  });
});
