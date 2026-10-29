/**
 * Read-only product lookup ports for AI Employee tools.
 * Source of truth: public.catalog_products (migration 249). Internal finance columns
 * (cost, margin_percent) and stock fields are never part of these records.
 */

export type ProductAgentRecord = {
  id: string;
  name: string;
  sku: string;
  brand: string;
  description: string;
  productType: string;
  categoryId: string | null;
  categoryName: string | null;
  /** Raw catalog price; 0 is the column default, so callers must not read it as "free". */
  basePrice: number | null;
  currency: string | null;
  priceTaxMode: "inclusive" | "exclusive" | "unspecified";
  taxPercent: number;
  subscriptionPrice: number | null;
  subscriptionInterval: string | null;
  unit: string;
  tags: string[];
  /** Synonyms used for search/rank when alias search is enabled. */
  aliases: string[];
  imageCount: number;
  /** Public photo URLs used only to deliver a single-product gallery. Never copied into the model payload. */
  imageUrls: string[];
};

export type SearchProductsPortInput = {
  /** Trusted conversation company — never from LLM arguments. */
  companyId: string;
  /** Sanitized search words (letters, digits, hyphen only). Empty means browse. */
  terms: string[];
  categoryId: string | null;
  /** Optional catalog product_type filter (e.g. service, real_estate). */
  productType?: string | null;
  limit: number;
};

export type SearchProductsPortResult = {
  products: ProductAgentRecord[];
  truncated: boolean;
};

export type GetProductsByIdsPortInput = {
  companyId: string;
  productIds: string[];
};

export type ProductAgentToolPorts = {
  searchProducts(input: SearchProductsPortInput): Promise<SearchProductsPortResult>;
  getProductsByIds(input: GetProductsByIdsPortInput): Promise<ProductAgentRecord[]>;
  /**
   * When this returns exactly true, recorded prices may be stored and returned.
   * Missing, throwing, or any other value hides prices before the router persists the result.
   */
  showProductPrices?: () => boolean;
  /**
   * Optional: persist verified single-product interest onto the conversation lead / opportunity.
   * Called when search/details returns exactly one catalog product, or when recommendation
   * is an unambiguous single recommend. Never called for multi-match or clarify actions.
   */
  recordVerifiedProductInterest?(input: {
    companyId: string;
    conversationId?: string | null;
    productId: string;
    productName: string | null;
    source?: string;
  }): Promise<{ linked: boolean; reason: string } | void>;
};
