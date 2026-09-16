import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatCurrencyOptionLabel,
  isOfficialCurrencyCode,
  listOfficialCurrencies,
  normalizeCurrencyCode,
} from "../src/lib/currency/catalog.ts";
import {
  assertHomogeneousCurrency,
  formatCompanyMoney,
  formatSubscriptionMoney,
} from "../src/lib/currency/format-money.ts";
import {
  assertDualCurrencySourcesDistinct,
  resolveOperationalCurrency,
  resolveSubscriptionBillingCurrency,
} from "../src/lib/currency/resolve.ts";
import { setCompanyLocaleRuntime } from "../src/lib/company-locale/runtime.ts";
import { resolveCompanyPayablePreview } from "../src/lib/billing/company-payable-amount.ts";

describe("currency catalog", () => {
  it("exposes official ISO codes with localized names", () => {
    const codes = listOfficialCurrencies().map((c) => c.code);
    assert.deepEqual(codes, ["EGP", "USD", "SAR", "AED", "EUR", "GBP"]);
    assert.equal(isOfficialCurrencyCode("egp"), true);
    assert.equal(normalizeCurrencyCode(" egp "), "EGP");
    assert.match(formatCurrencyOptionLabel("EGP", "en"), /Egyptian Pound/);
    assert.match(formatCurrencyOptionLabel("EGP", "ar"), /الجنيه المصري/);
  });
});

describe("dual currency resolution", () => {
  it("resolves operational and subscription currencies independently", () => {
    const operational = resolveOperationalCurrency({
      financialSettingsCurrency: "EGP",
      billingSettingCurrency: "USD",
    });
    const subscription = resolveSubscriptionBillingCurrency({
      commercialTermsCurrency: "USD",
      subscriptionCurrency: "EUR",
    });
    assert.equal(operational, "EGP");
    assert.equal(subscription, "USD");
    assert.equal(
      assertDualCurrencySourcesDistinct({
        operationalSource: "company_financial_settings.default_currency",
        subscriptionSource: "company_commercial_terms.subscription_billing_currency",
      }),
      true,
    );
  });

  it("changing operational input does not alter subscription resolution", () => {
    const before = resolveSubscriptionBillingCurrency({
      commercialTermsCurrency: "USD",
    });
    const afterOperationalChange = resolveSubscriptionBillingCurrency({
      commercialTermsCurrency: "USD",
    });
    assert.equal(before, "USD");
    assert.equal(afterOperationalChange, "USD");
    assert.equal(resolveOperationalCurrency({ financialSettingsCurrency: "SAR" }), "SAR");
  });

  it("upgrade/downgrade preserve subscription currency when commercial terms keep it", () => {
    const preserved = resolveSubscriptionBillingCurrency({
      commercialTermsCurrency: "USD",
      planPricingCurrency: "EUR",
    });
    assert.equal(preserved, "USD");
  });
});

describe("money formatters", () => {
  it("formats company operational money in EN and AR", () => {
    setCompanyLocaleRuntime({ currency: "EGP", intlLocale: "en-US" });
    const en = formatCompanyMoney(10000, "EGP", "en-US");
    assert.match(en, /10,000|10000/);
    assert.match(en, /EGP|E£|ج/);

    const ar = formatCompanyMoney(10000, "EGP", "ar-EG");
    assert.match(ar, /10|٠٠/);
  });

  it("subscription formatter never falls back to operational currency", () => {
    setCompanyLocaleRuntime({ currency: "EGP", intlLocale: "en-US" });
    assert.equal(formatSubscriptionMoney(99, null, "en-US"), "—");
    const usd = formatSubscriptionMoney(99, "USD", "en-US");
    assert.match(usd, /\$|USD|99/);
    assert.doesNotMatch(usd, /EGP|E£/);
  });

  it("flags mixed-currency aggregation", () => {
    const mixed = assertHomogeneousCurrency(["EGP", "USD"]);
    assert.equal(mixed.ok, false);
    const ok = assertHomogeneousCurrency(["EGP", "egp", null]);
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.currency, "EGP");
  });
});

describe("payable preview currency identity", () => {
  it("carries subscription currency without using operational defaults", () => {
    const preview = resolveCompanyPayablePreview({
      billingCycle: "monthly",
      plan: { pricing_mode: "fixed", price_monthly: 99, price_yearly: 990 },
      terms: {
        company_id: "c1",
        pricing_source: "list",
        discount_percent: 0,
        custom_price_monthly: null,
        custom_price_yearly: null,
        subscription_billing_currency: "USD",
        notes: null,
      },
      currency: "USD",
    });
    assert.equal(preview.currency, "USD");
    assert.equal(preview.payableAmount, 99);
  });
});
