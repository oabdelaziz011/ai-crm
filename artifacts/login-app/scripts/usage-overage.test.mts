import assert from "node:assert/strict";
import { calculateOveragePreview } from "../src/lib/billing/usage-overage.ts";

assert.equal(
  calculateOveragePreview({ metricCode: "whatsapp_messages", usage: null, override: null }),
  null,
);

const billed = calculateOveragePreview({
  metricCode: "whatsapp_messages",
  usage: 23500,
  override: {
    metric_code: "whatsapp_messages",
    included_quantity: 20000,
    is_unlimited: false,
    overage_allowed: true,
    overage_unit_size: 1000,
    overage_unit_price: 5,
  },
});
assert.ok(billed);
assert.equal(billed.overageQuantity, 3500);
assert.equal(billed.billableUnits, 4);
assert.equal(billed.charge, 20);
assert.equal(billed.chargeable, true);

const unknownIncluded = calculateOveragePreview({
  metricCode: "sms_sent",
  usage: 10,
  override: {
    metric_code: "sms_sent",
    included_quantity: null,
    is_unlimited: false,
    overage_allowed: true,
    overage_unit_size: 1000,
    overage_unit_price: 10,
  },
});
assert.equal(unknownIncluded?.chargeable, false);
assert.equal(unknownIncluded?.charge, null);

// Preview only — no invoice/settlement side effects in this helper.
assert.equal(typeof billed.charge, "number");

console.log("usage-overage.test.mts: ok");
