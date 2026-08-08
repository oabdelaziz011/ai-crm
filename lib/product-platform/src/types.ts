import type { PRODUCT_TYPES, SUBSCRIPTION_INTERVALS } from "./constants.js";

export type ProductType = (typeof PRODUCT_TYPES)[number];
export type SubscriptionInterval = (typeof SUBSCRIPTION_INTERVALS)[number];

export type ProductServiceContext = {
  userId: string | null;
  companyId: string | null;
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
};

export type ProductCategoryRecord = {
  id: string;
  companyId: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CatalogProductRecord = {
  id: string;
  companyId: string;
  categoryId: string | null;
  productType: ProductType;
  name: string;
  sku: string;
  brand: string;
  description: string;
  basePrice: number;
  currency: string;
  taxClass: string;
  cost: number | null;
  marginPercent: number | null;
  isActive: boolean;
  subscriptionInterval: SubscriptionInterval | null;
  subscriptionPrice: number | null;
  trackInventory: boolean;
  stockQuantity: number | null;
  unit: string;
  tags: string[];
  imageUrls: string[];
  documentUrls: string[];
  metadata: Record<string, unknown>;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductRegionalPriceRecord = {
  id: string;
  companyId: string;
  productId: string;
  country: string | null;
  market: string | null;
  region: string | null;
  localPrice: number;
  currencyOverride: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProductBundleItemRecord = {
  id: string;
  companyId: string;
  bundleProductId: string;
  componentProductId: string;
  quantity: number;
  sortOrder: number;
};

export type OpportunityLineItemRecord = {
  id: string;
  companyId: string;
  opportunityId: string;
  productId: string;
  productNameSnapshot: string;
  skuSnapshot: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxPercent: number;
  currency: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ProductHistoryRecord = {
  id: string;
  companyId: string;
  productId: string;
  eventType: string;
  fieldName: string | null;
  previousValue: string | null;
  newValue: string | null;
  summary: string;
  payload: Record<string, unknown>;
  actorUserId: string | null;
  createdAt: string;
};

/** Resolve effective unit price: regional override when country/market match, else global. */
export function resolveEffectivePrice(input: {
  basePrice: number;
  currency: string;
  regionalPrices: readonly ProductRegionalPriceRecord[];
  country?: string | null;
  market?: string | null;
  region?: string | null;
}): { unitPrice: number; currency: string; source: "global" | "regional" } {
  const country = input.country?.trim().toLowerCase() || null;
  const market = input.market?.trim().toLowerCase() || null;
  const region = input.region?.trim().toLowerCase() || null;

  const match = input.regionalPrices.find((p) => {
    if (!p.isActive) return false;
    const pc = p.country?.trim().toLowerCase() || null;
    const pm = p.market?.trim().toLowerCase() || null;
    const pr = p.region?.trim().toLowerCase() || null;
    if (country && pc && pc === country) return true;
    if (market && pm && pm === market) return true;
    if (region && pr && pr === region) return true;
    return false;
  });

  if (match) {
    return {
      unitPrice: match.localPrice,
      currency: match.currencyOverride || input.currency,
      source: "regional",
    };
  }
  return { unitPrice: input.basePrice, currency: input.currency, source: "global" };
}

export function computeLineAmounts(input: {
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxPercent: number;
}): { subtotal: number; taxAmount: number; total: number } {
  const qty = Math.max(0, input.quantity);
  const unit = Math.max(0, input.unitPrice);
  const discount = Math.min(100, Math.max(0, input.discountPercent));
  const tax = Math.min(100, Math.max(0, input.taxPercent));
  const subtotal = Math.round(qty * unit * (1 - discount / 100) * 100) / 100;
  const taxAmount = Math.round(subtotal * (tax / 100) * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;
  return { subtotal, taxAmount, total };
}

export function computeMarginPercent(basePrice: number, cost: number | null): number | null {
  if (cost == null || !Number.isFinite(cost) || basePrice <= 0) return null;
  return Math.round(((basePrice - cost) / basePrice) * 10000) / 100;
}
