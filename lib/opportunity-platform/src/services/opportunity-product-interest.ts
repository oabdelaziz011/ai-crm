/**
 * Product-interest → opportunity gate.
 * Never invents catalog IDs. Callers must supply a verified company-scoped product id
 * from search/recommend with an unambiguous match policy.
 */

export type ProductInterestOpportunityInput = {
  companyId: string;
  leadId: string;
  customerId?: string | null;
  /** Verified catalog product id — never invent from free text. */
  catalogProductId?: string | null;
  productName?: string | null;
  title?: string | null;
  /** Number of plausible catalog matches considered by the caller. */
  matchCount?: number;
  /** When set, product must belong to this company (reject cross-tenant ids). */
  productCompanyId?: string | null;
};

export type ProductInterestOpportunityDecision =
  | { action: "skip"; reason: "missing_product" | "ambiguous_product" | "no_lead" | "cross_company" }
  | { action: "reuse_or_create"; reason: "verified_product"; catalogProductId: string };

/**
 * Gate automatic opportunity association on verified product identity only.
 */
export function decideProductInterestOpportunity(
  input: ProductInterestOpportunityInput,
): ProductInterestOpportunityDecision {
  if (!input.leadId.trim()) {
    return { action: "skip", reason: "no_lead" };
  }
  const matchCount = input.matchCount ?? (input.catalogProductId?.trim() ? 1 : 0);
  if (matchCount > 1) {
    return { action: "skip", reason: "ambiguous_product" };
  }
  const productId = input.catalogProductId?.trim() || null;
  if (!productId) {
    return { action: "skip", reason: "missing_product" };
  }
  if (
    input.productCompanyId != null &&
    input.productCompanyId.trim() &&
    input.productCompanyId.trim() !== input.companyId.trim()
  ) {
    return { action: "skip", reason: "cross_company" };
  }
  return {
    action: "reuse_or_create",
    reason: "verified_product",
    catalogProductId: productId,
  };
}

/**
 * Map a catalog recommendation result into the opportunity gate.
 * Only a single recommend hit is eligible; clarify / multi / no_match skip.
 */
export function decideFromCatalogRecommendation(input: {
  companyId: string;
  leadId: string;
  customerId?: string | null;
  recommendationAction: string;
  products: ReadonlyArray<{ productId: string; name?: string | null }>;
}): ProductInterestOpportunityDecision {
  if (input.recommendationAction !== "recommend") {
    return {
      action: "skip",
      reason: input.products.length > 1 ? "ambiguous_product" : "missing_product",
    };
  }
  if (input.products.length !== 1) {
    return {
      action: "skip",
      reason: input.products.length > 1 ? "ambiguous_product" : "missing_product",
    };
  }
  const only = input.products[0]!;
  return decideProductInterestOpportunity({
    companyId: input.companyId,
    leadId: input.leadId,
    customerId: input.customerId,
    catalogProductId: only.productId,
    productName: only.name,
    matchCount: 1,
  });
}
