/**
 * AI Product Advisor (phase 1) — reusable presentation policy for catalog tools.
 *
 * Does not own catalog data, pricing engines, qualification, opportunities, or follow-up.
 * Consumes search/details results already scoped to one company and the existing
 * showProductPrices gate. Never invents stock, structured specs, or regional prices
 * when market/country context is absent from the tool execution context.
 */

import type { RecommendationDecision } from "./product-recommendation.js";

export const PRODUCT_ADVISOR_POLICY_VERSION = 1 as const;

export type AdvisorPresentation =
  | "clarify_need"
  | "empty_catalog"
  | "list"
  | "details"
  | "recommend"
  | "compare";

export type AdvisorComparableProduct = {
  productId: string;
  name: string;
  brand?: string | null;
  productType?: string | null;
  sku?: string | null;
  unit?: string | null;
  summary?: string | null;
  description?: string | null;
  tags?: readonly string[] | null;
  category?: { id?: string | null; name?: string | null } | null;
  price?:
    | { status: "listed"; amount: number; currency: string }
    | { status: "not_listed" }
    | null;
};

export type ProductAdvisorComparisonFact = {
  productId: string;
  field: string;
  value: string;
};

export type ProductAdvisorPolicyResult = {
  policyVersion: typeof PRODUCT_ADVISOR_POLICY_VERSION;
  pricesVisible: boolean;
  presentation: AdvisorPresentation;
  /** Model-facing rules for this turn — data only, no invented commercial claims. */
  guidance: string;
  /** Concrete question when the catalog or customer need is incomplete. */
  askCustomer: string | null;
  comparison: {
    productIds: string[];
    facts: ProductAdvisorComparisonFact[];
    note: string;
  } | null;
  /**
   * Regional / resolveEffectivePrice integration.
   * Phase 1: ToolExecutionContext has no verified country/market/region, so AI catalog
   * tools keep using base catalog price only. Do not guess geography from free text.
   */
  regionalPricing: {
    status: "unavailable_no_context";
    explanation: string;
  };
  recommendationAction: RecommendationDecision["action"] | null;
};

const ADVISOR_GUIDANCE_BASE =
  "Advisor policy: use only returned catalog fields. List matching products before deep detail. " +
  "Explain recommendation reasons only from catalog text overlap or an explicit customer product name. " +
  "Ask the customer for missing need, use-case, or budget instead of inventing requirements or specs. " +
  "Never claim stock, warehouse availability, warranty, delivery, or discounts unless those exact facts appear in the tool payload. " +
  "When price.status is not_listed, do not quote, convert, or invent a price.";

const REGIONAL_PRICING_GAP =
  "resolveEffectivePrice / product_regional_prices are not applied on AI product tools yet: " +
  "ToolExecutionContext does not carry a verified country, market, or region. " +
  "Listed amounts are catalog base_price (plus exclusive tax when configured), not regional overrides.";

/** Strict boolean gate used by search/details — only exact `true` enables prices. */
export function resolveAdvisorPricesVisible(readSetting: (() => unknown) | undefined): boolean {
  if (typeof readSetting !== "function") return false;
  try {
    return readSetting() === true;
  } catch {
    return false;
  }
}

function nonEmpty(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function priceLabel(
  price: AdvisorComparableProduct["price"],
  pricesVisible: boolean,
): string | null {
  if (!pricesVisible) return null;
  if (!price || price.status !== "listed") return "not listed in catalog";
  if (!Number.isFinite(price.amount) || price.amount <= 0 || !price.currency) {
    return "not listed in catalog";
  }
  return `${price.amount} ${price.currency}`;
}

/**
 * Build side-by-side facts from catalog fields that are actually present.
 * Skips empty/null fields. Does not invent attributes.
 */
export function buildAdvisorComparison(
  products: readonly AdvisorComparableProduct[],
  pricesVisible: boolean,
): ProductAdvisorPolicyResult["comparison"] {
  const slice = products.filter((p) => nonEmpty(p.productId) && nonEmpty(p.name)).slice(0, 3);
  if (slice.length < 2) return null;

  const facts: ProductAdvisorComparisonFact[] = [];
  for (const product of slice) {
    const rows: Array<[string, string | null]> = [
      ["name", nonEmpty(product.name)],
      ["sku", nonEmpty(product.sku)],
      ["brand", nonEmpty(product.brand)],
      ["productType", nonEmpty(product.productType)],
      ["category", nonEmpty(product.category?.name)],
      ["unit", nonEmpty(product.unit)],
      ["price", priceLabel(product.price, pricesVisible)],
    ];
    for (const [field, value] of rows) {
      if (!value) continue;
      facts.push({ productId: product.productId, field, value });
    }
    const tags = (product.tags ?? [])
      .map((tag) => nonEmpty(tag))
      .filter((tag): tag is string => Boolean(tag))
      .slice(0, 5);
    if (tags.length > 0) {
      facts.push({ productId: product.productId, field: "tags", value: tags.join(", ") });
    }
  }

  const comparableFields = new Set(facts.map((fact) => fact.field));
  const hasBeyondName = [...comparableFields].some((field) => field !== "name");
  return {
    productIds: slice.map((product) => product.productId),
    facts,
    note: hasBeyondName
      ? "Comparison uses only catalog fields present on each product. Ask which attributes matter if the customer needs a deeper fit."
      : "Catalog rows share little beyond names. Ask the customer which attributes (use-case, budget, brand) matter before recommending.",
  };
}

export function buildProductAdvisorPolicy(input: {
  pricesVisible: boolean;
  products: readonly AdvisorComparableProduct[];
  recommendation?: RecommendationDecision | null;
  mode: "search" | "details";
  /** True when the customer typed text that produced zero searchable terms. */
  queryHadNoSearchableTerms?: boolean;
}): ProductAdvisorPolicyResult {
  const pricesVisible = input.pricesVisible === true;
  const products = input.products.filter((p) => nonEmpty(p.productId) && nonEmpty(p.name));
  const recommendation = input.recommendation ?? null;
  const recommendationAction = recommendation?.action ?? null;

  let presentation: AdvisorPresentation;
  let askCustomer: string | null = null;

  if (input.queryHadNoSearchableTerms) {
    presentation = "clarify_need";
    askCustomer = "What product name, use-case, or category should I search for?";
  } else if (recommendationAction === "clarify" || recommendationAction === "contradictory") {
    presentation = "clarify_need";
    askCustomer = recommendation?.clarification ?? "What will you use it for, and do you have a budget?";
  } else if (products.length === 0) {
    presentation = "empty_catalog";
    askCustomer =
      recommendation?.clarification ??
      "No active catalog match. Share another product name, use-case, or category to search again.";
  } else if (input.mode === "details" && products.length >= 2) {
    presentation = "compare";
  } else if (recommendationAction === "recommend" && (recommendation?.products.length ?? 0) > 0) {
    presentation = products.length === 1 ? "details" : "recommend";
  } else if (products.length === 1) {
    presentation = "details";
  } else {
    presentation = "list";
  }

  const comparison =
    presentation === "compare" || (presentation === "list" && products.length >= 2) || presentation === "recommend"
      ? buildAdvisorComparison(products, pricesVisible)
      : null;

  // List-first on search: multiple hits always present as a list. Ranking stays on
  // `recommendation` when present; do not collapse the turn into single-product details.
  if (
    input.mode === "search" &&
    products.length > 1 &&
    (presentation === "details" || presentation === "recommend")
  ) {
    presentation = "list";
  }

  const guidanceParts = [ADVISOR_GUIDANCE_BASE];
  if (!pricesVisible) {
    guidanceParts.push("Prices are hidden for this company/employee setting; do not mention amounts.");
  }
  if (presentation === "list" || presentation === "recommend") {
    guidanceParts.push("Present the product list first; only dive into one product after the customer picks or asks.");
  }
  if (comparison) {
    guidanceParts.push("When comparing, use advisor.comparison.facts only; do not invent differentiating specs.");
  }

  return {
    policyVersion: PRODUCT_ADVISOR_POLICY_VERSION,
    pricesVisible,
    presentation,
    guidance: guidanceParts.join(" "),
    askCustomer,
    comparison,
    regionalPricing: {
      status: "unavailable_no_context",
      explanation: REGIONAL_PRICING_GAP,
    },
    recommendationAction,
  };
}
