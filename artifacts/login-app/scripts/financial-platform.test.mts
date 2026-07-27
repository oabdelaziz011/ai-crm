import assert from "node:assert/strict";
import { PaymentProviderRegistry, SandboxFinancialProvider } from "../src/lib/billing/providers/payment-provider-registry.ts";
import { TaxEngineService } from "../src/lib/billing/taxes/tax-engine-service.ts";
import { applyPercentageDiscount, centsFromDecimal, sumCents } from "../src/lib/billing/utilities/money.ts";
import { buildIdempotencyKey } from "../src/lib/billing/utilities/idempotency.ts";
import { timingSafeEqual } from "../src/lib/billing/security/timing-safe-equal.ts";

{
  const registry = PaymentProviderRegistry.createDefault();
  assert.ok(registry.get("stripe"));
  assert.ok(registry.get("paymob"));
  assert.ok(registry.get("fawry"));
  assert.ok(registry.get("sandbox"));
}

{
  const sandbox = new SandboxFinancialProvider();
  const result = await sandbox.createIntent({
    companyId: "c1",
    invoiceId: "inv1",
    customerId: "cust1",
    amountCents: 5000,
    currency: "USD",
    providerCode: "sandbox",
    returnUrl: "https://example.com/return",
  });
  assert.equal(result.providerCode, "sandbox");
  assert.ok(result.checkoutUrl?.includes("inv1"));
}

{
  assert.equal(applyPercentageDiscount(10000, 14), 1400);
  assert.equal(centsFromDecimal(10.5), 1050);
  assert.equal(sumCents([100, 200, 50]), 350);
}

{
  const key = buildIdempotencyKey("pay", ["c1", "inv1", "5000"]);
  assert.ok(key.startsWith("pay:"));
}

{
  const a = new Uint8Array([1, 2, 3]);
  const b = new Uint8Array([1, 2, 3]);
  const c = new Uint8Array([1, 2, 4]);
  assert.equal(timingSafeEqual(a, b), true);
  assert.equal(timingSafeEqual(a, c), false);
}

{
  class StubTaxClient {
    from(_table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({
          data: { rate_percent: 14, is_inclusive: false, is_exempt: false },
        }),
      };
      return chain;
    }
  }
  const taxEngine = new TaxEngineService(new StubTaxClient() as never);
  const calc = await taxEngine.calculate("c1", 10000, "exclusive");
  assert.equal(calc.taxCents, 1400);
  assert.equal(calc.totalCents, 11400);
}

console.log("financial-platform.test.mts: all assertions passed");
