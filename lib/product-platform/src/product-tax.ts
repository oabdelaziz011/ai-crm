/**
 * `unspecified` is display-only: customer-facing replies must not mention tax.
 * Price math is identical to `inclusive` (the entered price is the customer total).
 */
export const PRODUCT_PRICE_TAX_MODES = ["inclusive", "exclusive", "unspecified"] as const;
export type ProductPriceTaxMode = (typeof PRODUCT_PRICE_TAX_MODES)[number];

export type ProductTaxBreakdown = {
  mode: ProductPriceTaxMode;
  taxPercent: number;
  entered: number;
  net: number;
  taxAmount: number;
  gross: number;
};

export function roundCatalogMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function normalizePriceTaxMode(value: unknown): ProductPriceTaxMode {
  if (value === "exclusive" || value === "unspecified") return value;
  return "inclusive";
}

export function normalizeTaxPercent(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, Math.round(parsed * 1000) / 1000));
}

export function parseTaxPercentInput(value: unknown): number | null {
  if (value == null || value === "") return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
  return Math.round(parsed * 1000) / 1000;
}

/** Staff-entered price plus tax mode/percent → net, VAT, and the customer total. */
export function computeProductTaxBreakdown(input: {
  enteredPrice: number;
  taxMode?: unknown;
  taxPercent?: unknown;
}): ProductTaxBreakdown {
  const entered = roundCatalogMoney(Math.max(0, Number.isFinite(input.enteredPrice) ? input.enteredPrice : 0));
  const mode = normalizePriceTaxMode(input.taxMode);
  const taxPercent = normalizeTaxPercent(input.taxPercent);
  const rate = taxPercent / 100;
  if (rate <= 0) {
    return { mode, taxPercent: 0, entered, net: entered, taxAmount: 0, gross: entered };
  }
  if (mode === "exclusive") {
    const net = entered;
    const taxAmount = roundCatalogMoney(net * rate);
    const gross = roundCatalogMoney(net + taxAmount);
    return { mode, taxPercent, entered, net, taxAmount, gross };
  }
  const gross = entered;
  const net = roundCatalogMoney(gross / (1 + rate));
  const taxAmount = roundCatalogMoney(gross - net);
  return { mode, taxPercent, entered, net, taxAmount, gross };
}

/** What the customer pays. Subscription amount wins when both are set. */
export function catalogCustomerUnitPrice(product: {
  basePrice: number;
  subscriptionPrice?: number | null;
  subscriptionInterval?: string | null;
  priceTaxMode?: unknown;
  taxPercent?: unknown;
}): number {
  const entered =
    product.subscriptionPrice != null && product.subscriptionInterval
      ? product.subscriptionPrice
      : product.basePrice;
  return computeProductTaxBreakdown({
    enteredPrice: entered,
    taxMode: product.priceTaxMode,
    taxPercent: product.taxPercent,
  }).gross;
}
