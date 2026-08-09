import type {
  CatalogProductRecord,
  OpportunityLineItemRecord,
  ProductBundleItemRecord,
  ProductCategoryRecord,
  ProductHistoryRecord,
  ProductRegionalPriceRecord,
  ProductType,
  SubscriptionInterval,
} from "../types.js";

export type CreateProductInput = {
  companyId: string;
  categoryId?: string | null;
  productType: ProductType;
  name: string;
  sku: string;
  brand?: string;
  description?: string;
  basePrice: number;
  currency?: string;
  taxClass?: string;
  cost?: number | null;
  marginPercent?: number | null;
  isActive?: boolean;
  subscriptionInterval?: SubscriptionInterval | null;
  subscriptionPrice?: number | null;
  trackInventory?: boolean;
  stockQuantity?: number | null;
  unit?: string;
  tags?: string[];
  imageUrls?: string[];
  documentUrls?: string[];
  metadata?: Record<string, unknown>;
  createdBy: string | null;
};

export type UpdateProductInput = Partial<Omit<CreateProductInput, "companyId" | "createdBy" | "sku">> & {
  companyId: string;
  productId: string;
  sku?: string;
  updatedBy: string | null;
};

export interface ProductRepository {
  createCategory(input: {
    companyId: string;
    parentId?: string | null;
    name: string;
    slug: string;
    description?: string;
    sortOrder?: number;
    createdBy: string | null;
  }): Promise<ProductCategoryRecord>;

  updateCategory(input: {
    companyId: string;
    categoryId: string;
    name?: string;
    parentId?: string | null;
    description?: string;
    sortOrder?: number;
    isActive?: boolean;
    updatedBy: string | null;
  }): Promise<ProductCategoryRecord>;

  listCategories(companyId: string): Promise<ProductCategoryRecord[]>;
  getCategory(companyId: string, categoryId: string): Promise<ProductCategoryRecord | null>;

  createProduct(input: CreateProductInput): Promise<CatalogProductRecord>;
  updateProduct(input: UpdateProductInput): Promise<CatalogProductRecord>;
  softDeleteProduct(companyId: string, productId: string, updatedBy: string | null): Promise<void>;
  getProduct(companyId: string, productId: string): Promise<CatalogProductRecord | null>;
  listProducts(input: {
    companyId: string;
    categoryId?: string;
    productType?: ProductType;
    query?: string;
    activeOnly?: boolean;
    limit: number;
    offset: number;
  }): Promise<{ items: CatalogProductRecord[]; total: number }>;

  listRegionalPrices(companyId: string, productId: string): Promise<ProductRegionalPriceRecord[]>;
  upsertRegionalPrice(input: {
    companyId: string;
    productId: string;
    id?: string;
    country?: string | null;
    market?: string | null;
    region?: string | null;
    localPrice: number;
    currencyOverride?: string | null;
    isActive?: boolean;
    actorUserId: string | null;
  }): Promise<ProductRegionalPriceRecord>;

  listBundleItems(companyId: string, bundleProductId: string): Promise<ProductBundleItemRecord[]>;
  setBundleItems(input: {
    companyId: string;
    bundleProductId: string;
    items: Array<{ componentProductId: string; quantity: number }>;
  }): Promise<ProductBundleItemRecord[]>;

  listOpportunityLines(companyId: string, opportunityId: string): Promise<OpportunityLineItemRecord[]>;
  getOpportunityLine(companyId: string, lineId: string): Promise<OpportunityLineItemRecord | null>;
  getOpportunityCurrency(companyId: string, opportunityId: string): Promise<string | null>;
  upsertOpportunityLine(input: {
    companyId: string;
    opportunityId: string;
    id?: string;
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
    sortOrder?: number;
    actorUserId: string | null;
  }): Promise<OpportunityLineItemRecord>;
  removeOpportunityLine(companyId: string, lineId: string, actorUserId: string | null): Promise<void>;

  addHistory(input: {
    companyId: string;
    productId: string;
    eventType: string;
    fieldName?: string | null;
    previousValue?: string | null;
    newValue?: string | null;
    summary?: string;
    payload?: Record<string, unknown>;
    actorUserId: string | null;
  }): Promise<ProductHistoryRecord>;

  listHistory(companyId: string, productId: string, limit?: number): Promise<ProductHistoryRecord[]>;
}
