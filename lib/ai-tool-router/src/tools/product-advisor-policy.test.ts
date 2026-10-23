import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PRODUCT_ADVISOR_POLICY_VERSION,
  buildAdvisorComparison,
  buildProductAdvisorPolicy,
  resolveAdvisorPricesVisible,
  type AdvisorComparableProduct,
} from "./product-advisor-policy.js";
import type { RecommendationDecision } from "./product-recommendation.js";

function product(
  id: string,
  overrides: Partial<AdvisorComparableProduct> = {},
): AdvisorComparableProduct {
  return {
    productId: id,
    name: `Product ${id}`,
    brand: "Brand",
    productType: "product",
    sku: `SKU-${id}`,
    unit: "each",
    tags: ["audio"],
    category: { id: "cat-1", name: "Audio" },
    price: { status: "listed", amount: 100, currency: "USD" },
    ...overrides,
  };
}

function recommend(action: RecommendationDecision["action"], productIds: string[] = []): RecommendationDecision {
  return {
    action,
    language: "en",
    products: productIds.map((productId) => ({
      productId,
      name: `Product ${productId}`,
      sku: null,
      price: { status: "not_listed" as const },
      reasons: ["matches audio"],
      imageUrls: [],
    })),
    clarification: action === "clarify" ? "What will you use it for?" : null,
    evidence: [],
    customerText: "",
  };
}

describe("resolveAdvisorPricesVisible", () => {
  it("defaults to false without a reader", () => {
    assert.equal(resolveAdvisorPricesVisible(undefined), false);
  });

  it("accepts only exact true", () => {
    assert.equal(resolveAdvisorPricesVisible(() => true), true);
    assert.equal(resolveAdvisorPricesVisible(() => "true"), false);
    assert.equal(resolveAdvisorPricesVisible(() => 1), false);
    assert.equal(resolveAdvisorPricesVisible(() => false), false);
  });

  it("fails closed when the reader throws", () => {
    assert.equal(
      resolveAdvisorPricesVisible(() => {
        throw new Error("settings down");
      }),
      false,
    );
  });
});

describe("buildAdvisorComparison", () => {
  it("returns null for fewer than two named products", () => {
    assert.equal(buildAdvisorComparison([product("a")], true), null);
    assert.equal(buildAdvisorComparison([], true), null);
  });

  it("includes only present catalog fields and omits prices when hidden", () => {
    const comparison = buildAdvisorComparison(
      [
        product("a", { brand: "Sonic", price: { status: "listed", amount: 249.5, currency: "USD" } }),
        product("b", { brand: "Ergo", sku: null, price: { status: "listed", amount: 99, currency: "USD" } }),
      ],
      false,
    );
    assert.ok(comparison);
    assert.deepEqual(comparison!.productIds, ["a", "b"]);
    assert.equal(
      comparison!.facts.some((fact) => fact.field === "price"),
      false,
    );
    assert.ok(comparison!.facts.some((fact) => fact.field === "brand" && fact.value === "Sonic"));
    assert.ok(!JSON.stringify(comparison).includes("249.5"));
  });

  it("includes listed price facts when prices are visible", () => {
    const comparison = buildAdvisorComparison([product("a"), product("b")], true);
    assert.ok(comparison!.facts.some((fact) => fact.field === "price" && fact.value === "100 USD"));
  });
});

describe("buildProductAdvisorPolicy", () => {
  it("asks the customer when the query has no searchable terms", () => {
    const policy = buildProductAdvisorPolicy({
      pricesVisible: false,
      products: [],
      mode: "search",
      queryHadNoSearchableTerms: true,
    });
    assert.equal(policy.policyVersion, PRODUCT_ADVISOR_POLICY_VERSION);
    assert.equal(policy.presentation, "clarify_need");
    assert.match(policy.askCustomer ?? "", /product name|use-case|category/i);
    assert.equal(policy.regionalPricing.status, "unavailable_no_context");
  });

  it("uses empty_catalog when nothing matches", () => {
    const policy = buildProductAdvisorPolicy({
      pricesVisible: true,
      products: [],
      mode: "search",
      recommendation: recommend("no_match"),
    });
    assert.equal(policy.presentation, "empty_catalog");
    assert.ok(policy.askCustomer);
    assert.equal(policy.recommendationAction, "no_match");
  });

  it("lists multiple search hits and attaches comparison facts", () => {
    const policy = buildProductAdvisorPolicy({
      pricesVisible: true,
      products: [product("a"), product("b"), product("c")],
      mode: "search",
    });
    assert.equal(policy.presentation, "list");
    assert.ok(policy.comparison);
    assert.equal(policy.comparison!.productIds.length, 3);
    assert.match(policy.guidance, /List matching products/i);
  });

  it("compares multiple detail ids without inventing specs", () => {
    const policy = buildProductAdvisorPolicy({
      pricesVisible: false,
      products: [
        product("a", { description: null, summary: null }),
        product("b", { description: null, summary: null }),
      ],
      mode: "details",
    });
    assert.equal(policy.presentation, "compare");
    assert.ok(policy.comparison);
    assert.equal(policy.pricesVisible, false);
    assert.match(policy.guidance, /Prices are hidden/);
    assert.match(policy.guidance, /do not invent differentiating specs/i);
  });

  it("prefers clarify when recommendation needs more customer info", () => {
    const policy = buildProductAdvisorPolicy({
      pricesVisible: true,
      products: [product("a"), product("b")],
      mode: "search",
      recommendation: recommend("clarify"),
    });
    assert.equal(policy.presentation, "clarify_need");
    assert.equal(policy.askCustomer, "What will you use it for?");
  });

  it("keeps list-first on multi-hit search even when ranking recommends one", () => {
    const policy = buildProductAdvisorPolicy({
      pricesVisible: true,
      products: [product("a"), product("b")],
      mode: "search",
      recommendation: recommend("recommend", ["a"]),
    });
    assert.equal(policy.presentation, "list");
    assert.equal(policy.recommendationAction, "recommend");
    assert.ok(policy.comparison);
  });

  it("uses recommend presentation for a single search hit with ranking", () => {
    const policy = buildProductAdvisorPolicy({
      pricesVisible: true,
      products: [product("a")],
      mode: "search",
      recommendation: recommend("recommend", ["a"]),
    });
    assert.equal(policy.presentation, "details");
    assert.equal(policy.recommendationAction, "recommend");
  });

  it("documents regional pricing gap without guessing geography", () => {
    const policy = buildProductAdvisorPolicy({
      pricesVisible: true,
      products: [product("a")],
      mode: "details",
    });
    assert.equal(policy.presentation, "details");
    assert.equal(policy.regionalPricing.status, "unavailable_no_context");
    assert.match(policy.regionalPricing.explanation, /resolveEffectivePrice/);
    assert.match(policy.regionalPricing.explanation, /ToolExecutionContext/);
  });
});
