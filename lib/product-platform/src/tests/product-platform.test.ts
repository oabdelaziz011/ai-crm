import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PRODUCT_PERMISSIONS, PRODUCT_TYPES } from "../constants.js";
import { computeLineAmounts, computeMarginPercent, resolveEffectivePrice } from "../types.js";

describe("product-platform foundation", () => {
  it("exposes permissions and product types", () => {
    assert.equal(PRODUCT_PERMISSIONS.pricing, "products.pricing");
    assert.deepEqual([...PRODUCT_TYPES], ["product", "service", "subscription", "bundle", "addon"]);
  });

  it("computes line amounts with discount and tax", () => {
    const amounts = computeLineAmounts({
      quantity: 2,
      unitPrice: 100,
      discountPercent: 10,
      taxPercent: 15,
    });
    assert.equal(amounts.subtotal, 180);
    assert.equal(amounts.taxAmount, 27);
    assert.equal(amounts.total, 207);
  });

  it("computes margin", () => {
    assert.equal(computeMarginPercent(100, 40), 60);
    assert.equal(computeMarginPercent(100, null), null);
  });

  it("resolves regional price over global", () => {
    const priced = resolveEffectivePrice({
      basePrice: 100,
      currency: "USD",
      country: "SA",
      regionalPrices: [
        {
          id: "1",
          companyId: "c",
          productId: "p",
          country: "SA",
          market: null,
          region: null,
          localPrice: 375,
          currencyOverride: "SAR",
          isActive: true,
          createdAt: "",
          updatedAt: "",
        },
      ],
    });
    assert.equal(priced.source, "regional");
    assert.equal(priced.unitPrice, 375);
    assert.equal(priced.currency, "SAR");
  });
});
