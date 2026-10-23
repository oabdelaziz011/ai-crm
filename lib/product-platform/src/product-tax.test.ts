import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  catalogCustomerUnitPrice,
  computeProductTaxBreakdown,
  normalizePriceTaxMode,
  parseTaxPercentInput,
} from "./product-tax.js";

describe("product tax breakdown", () => {
  it("keeps inclusive price as the customer total and derives net", () => {
    const priced = computeProductTaxBreakdown({
      enteredPrice: 114,
      taxMode: "inclusive",
      taxPercent: 14,
    });
    assert.equal(priced.gross, 114);
    assert.equal(priced.net, 100);
    assert.equal(priced.taxAmount, 14);
  });

  it("adds tax on exclusive price so the customer sees gross only", () => {
    const priced = computeProductTaxBreakdown({
      enteredPrice: 100,
      taxMode: "exclusive",
      taxPercent: 14,
    });
    assert.equal(priced.net, 100);
    assert.equal(priced.taxAmount, 14);
    assert.equal(priced.gross, 114);
  });

  it("treats missing tax as a no-op so existing catalog prices stay unchanged", () => {
    const priced = computeProductTaxBreakdown({ enteredPrice: 249.5 });
    assert.equal(priced.mode, "inclusive");
    assert.equal(priced.taxPercent, 0);
    assert.equal(priced.gross, 249.5);
    assert.equal(priced.net, 249.5);
  });

  it("uses the subscription amount as the customer total when billed on a cycle", () => {
    assert.equal(
      catalogCustomerUnitPrice({
        basePrice: 1000,
        subscriptionPrice: 100,
        subscriptionInterval: "month",
        priceTaxMode: "exclusive",
        taxPercent: 14,
      }),
      114,
    );
  });

  it("rejects tax percents outside 0–100", () => {
    assert.equal(parseTaxPercentInput(-1), null);
    assert.equal(parseTaxPercentInput(101), null);
    assert.equal(parseTaxPercentInput("14"), 14);
    assert.equal(normalizePriceTaxMode("exclusive"), "exclusive");
    assert.equal(normalizePriceTaxMode("other"), "inclusive");
  });

  it("normalizes all three modes and defaults unknown values to inclusive", () => {
    assert.equal(normalizePriceTaxMode("inclusive"), "inclusive");
    assert.equal(normalizePriceTaxMode("exclusive"), "exclusive");
    assert.equal(normalizePriceTaxMode("unspecified"), "unspecified");
    assert.equal(normalizePriceTaxMode(undefined), "inclusive");
    assert.equal(normalizePriceTaxMode(null), "inclusive");
    assert.equal(normalizePriceTaxMode("Unspecified"), "inclusive");
  });

  it("unspecified is display-only and uses the inclusive numeric path", () => {
    const unspecified = computeProductTaxBreakdown({
      enteredPrice: 114,
      taxMode: "unspecified",
      taxPercent: 14,
    });
    const inclusive = computeProductTaxBreakdown({
      enteredPrice: 114,
      taxMode: "inclusive",
      taxPercent: 14,
    });
    assert.equal(unspecified.mode, "unspecified");
    assert.equal(unspecified.gross, 114);
    assert.equal(unspecified.net, inclusive.net);
    assert.equal(unspecified.taxAmount, inclusive.taxAmount);
    assert.equal(
      catalogCustomerUnitPrice({ basePrice: 114, priceTaxMode: "unspecified", taxPercent: 14 }),
      114,
    );
    assert.equal(
      catalogCustomerUnitPrice({
        basePrice: 1000,
        subscriptionPrice: 100,
        subscriptionInterval: "month",
        priceTaxMode: "unspecified",
        taxPercent: 14,
      }),
      100,
    );
  });
});
