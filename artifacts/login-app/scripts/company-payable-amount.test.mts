import assert from "node:assert/strict";
import { resolveCompanyPayablePreview } from "../src/lib/billing/company-payable-amount.ts";

const plan = { pricing_mode: "fixed", price_monthly: 199, price_yearly: 1990 };

const list = resolveCompanyPayablePreview({
  billingCycle: "monthly",
  plan,
  terms: null,
});
assert.equal(list.payableAmount, 199);
assert.equal(list.source, "list");
assert.equal(list.onlineCheckoutAllowed, true);

const discounted = resolveCompanyPayablePreview({
  billingCycle: "monthly",
  plan,
  terms: {
    company_id: "c1",
    pricing_source: "discount",
    discount_percent: 10,
    custom_price_monthly: null,
    custom_price_yearly: null,
    notes: null,
  },
});
assert.equal(discounted.payableAmount, 179.1);
assert.equal(discounted.source, "discount");
assert.equal(discounted.onlineCheckoutAllowed, true);

const custom = resolveCompanyPayablePreview({
  billingCycle: "monthly",
  plan,
  terms: {
    company_id: "c1",
    pricing_source: "custom",
    discount_percent: 0,
    custom_price_monthly: 149,
    custom_price_yearly: 1400,
    notes: null,
  },
});
assert.equal(custom.payableAmount, 149);
assert.equal(custom.listAmount, 199);
assert.equal(custom.onlineCheckoutAllowed, true);

const free = resolveCompanyPayablePreview({
  billingCycle: "monthly",
  plan: { pricing_mode: "free", price_monthly: 0, price_yearly: 0 },
  terms: null,
});
assert.equal(free.payableAmount, 0);
assert.equal(free.onlineCheckoutAllowed, false);

console.log("company-payable-amount.test.mts: ok");
