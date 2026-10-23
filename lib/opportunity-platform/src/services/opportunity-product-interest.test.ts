import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decideFromCatalogRecommendation,
  decideProductInterestOpportunity,
} from "./opportunity-product-interest.js";

describe("decideProductInterestOpportunity", () => {
  it("skips when product is not confidently identified", () => {
    assert.deepEqual(
      decideProductInterestOpportunity({
        companyId: "co",
        leadId: "lead-1",
        catalogProductId: null,
        productName: "something nice",
      }),
      { action: "skip", reason: "missing_product" },
    );
  });

  it("skips ambiguous multi-match", () => {
    assert.deepEqual(
      decideProductInterestOpportunity({
        companyId: "co",
        leadId: "lead-1",
        catalogProductId: "prod-1",
        matchCount: 2,
      }),
      { action: "skip", reason: "ambiguous_product" },
    );
  });

  it("rejects cross-company catalog ids", () => {
    assert.deepEqual(
      decideProductInterestOpportunity({
        companyId: "co-a",
        leadId: "lead-1",
        catalogProductId: "prod-1",
        productCompanyId: "co-b",
        matchCount: 1,
      }),
      { action: "skip", reason: "cross_company" },
    );
  });

  it("allows create/reuse only with verified catalog product id", () => {
    assert.deepEqual(
      decideProductInterestOpportunity({
        companyId: "co",
        leadId: "lead-1",
        catalogProductId: "prod-99",
      }),
      {
        action: "reuse_or_create",
        reason: "verified_product",
        catalogProductId: "prod-99",
      },
    );
  });
});

describe("decideFromCatalogRecommendation", () => {
  it("requires recommend action with exactly one product", () => {
    assert.equal(
      decideFromCatalogRecommendation({
        companyId: "co",
        leadId: "lead-1",
        recommendationAction: "clarify",
        products: [{ productId: "p1" }],
      }).action,
      "skip",
    );
    assert.equal(
      decideFromCatalogRecommendation({
        companyId: "co",
        leadId: "lead-1",
        recommendationAction: "recommend",
        products: [
          { productId: "p1" },
          { productId: "p2" },
        ],
      }).reason,
      "ambiguous_product",
    );
    assert.deepEqual(
      decideFromCatalogRecommendation({
        companyId: "co",
        leadId: "lead-1",
        recommendationAction: "recommend",
        products: [{ productId: "p1", name: "Villa" }],
      }),
      {
        action: "reuse_or_create",
        reason: "verified_product",
        catalogProductId: "p1",
      },
    );
  });
});
