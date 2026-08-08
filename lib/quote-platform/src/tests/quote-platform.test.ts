import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QUOTE_PERMISSIONS, QUOTE_STATUSES } from "../constants.js";
import {
  computeQuoteLineAmounts,
  computeQuoteTotals,
  computeWeightedRevenue,
  type QuoteLineItemRecord,
} from "../types.js";

describe("quote-platform foundation", () => {
  it("exposes lifecycle statuses and permissions", () => {
    assert.deepEqual([...QUOTE_STATUSES], [
      "draft",
      "internal_review",
      "sent",
      "viewed",
      "accepted",
      "rejected",
      "expired",
      "converted",
    ]);
    assert.equal(QUOTE_PERMISSIONS.view, "quotes.view");
    assert.equal(QUOTE_PERMISSIONS.approve, "quotes.approve");
  });

  it("computes line amounts with percent discount via product engine", () => {
    const amounts = computeQuoteLineAmounts({
      quantity: 2,
      unitPrice: 100,
      discountPercent: 10,
      taxPercent: 5,
    });
    assert.equal(amounts.discountAmount, 20);
    assert.equal(amounts.subtotal, 180);
    assert.equal(amounts.taxAmount, 9);
    assert.equal(amounts.total, 189);
  });

  it("computes totals and weighted revenue", () => {
    const lines: QuoteLineItemRecord[] = [
      {
        id: "1",
        companyId: "c",
        quoteId: "q",
        lineKind: "product",
        productId: "p",
        productNameSnapshot: "A",
        skuSnapshot: "A",
        sectionTitle: null,
        notes: "",
        isOptional: false,
        quantity: 1,
        unitPrice: 100,
        discountPercent: 0,
        discountAmount: 0,
        taxPercent: 0,
        currency: "USD",
        subtotal: 100,
        taxAmount: 0,
        total: 100,
        sortOrder: 0,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "2",
        companyId: "c",
        quoteId: "q",
        lineKind: "section",
        productId: null,
        productNameSnapshot: "Section",
        skuSnapshot: "",
        sectionTitle: "Services",
        notes: "",
        isOptional: false,
        quantity: 0,
        unitPrice: 0,
        discountPercent: 0,
        discountAmount: 0,
        taxPercent: 0,
        currency: "USD",
        subtotal: 0,
        taxAmount: 0,
        total: 0,
        sortOrder: 1,
        createdAt: "",
        updatedAt: "",
      },
    ];
    const totals = computeQuoteTotals(lines);
    assert.equal(totals.grandTotal, 100);
    assert.equal(computeWeightedRevenue(100, 40), 40);
    assert.equal(computeWeightedRevenue(100, null), null);
  });
});
