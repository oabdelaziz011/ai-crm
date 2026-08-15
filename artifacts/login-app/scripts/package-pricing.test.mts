import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateAnnualSavings,
  formatPackageListPrice,
  normalizePackagePricingMode,
  resolvePackageListAmount,
} from "../src/lib/billing/package-pricing.ts";

describe("package-pricing (Phase 7.4)", () => {
  it("normalizes pricing modes", () => {
    assert.equal(normalizePackagePricingMode("FREE"), "free");
    assert.equal(normalizePackagePricingMode(null, 0, 0), "free");
    assert.equal(normalizePackagePricingMode(null, 10, 100), "fixed");
    assert.equal(normalizePackagePricingMode("custom"), "custom");
  });

  it("calculates annual savings without divide-by-zero", () => {
    const savings = calculateAnnualSavings(100, 1000);
    assert.equal(savings.savings, 200);
    assert.ok(savings.savingsPercent != null && Math.abs(savings.savingsPercent - 16.666) < 0.01);
    assert.ok(savings.effectiveMonthly != null && Math.abs(savings.effectiveMonthly - 1000 / 12) < 0.001);

    assert.deepEqual(calculateAnnualSavings(0, 0), {
      savings: 0,
      savingsPercent: null,
      effectiveMonthly: null,
    });
    assert.deepEqual(calculateAnnualSavings(null, null), {
      savings: 0,
      savingsPercent: null,
      effectiveMonthly: null,
    });
  });

  it("formats list prices by mode and cycle", () => {
    assert.equal(
      formatPackageListPrice({ pricing_mode: "free", price_monthly: 0, price_yearly: 0 }),
      "Free",
    );
    assert.match(
      formatPackageListPrice(
        { pricing_mode: "fixed", price_monthly: 99, price_yearly: 990 },
        { billingCycle: "monthly", currency: "USD", withPeriod: true },
      ),
      /\/month$/,
    );
    assert.equal(
      resolvePackageListAmount({ pricing_mode: "custom", price_monthly: 0, price_yearly: 0 }, "monthly"),
      null,
    );
    assert.equal(
      resolvePackageListAmount({ pricing_mode: "fixed", price_monthly: 99, price_yearly: 990 }, "yearly"),
      990,
    );
  });
});
