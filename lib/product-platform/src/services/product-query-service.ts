import { PRODUCT_PERMISSIONS } from "../constants.js";
import { ProductPermissionError } from "../errors.js";
import type { ProductRepository } from "../repositories/product-repository-port.js";
import type {
  CatalogProductRecord,
  OpportunityLineItemRecord,
  ProductBundleItemRecord,
  ProductCategoryRecord,
  ProductHistoryRecord,
  ProductRegionalPriceRecord,
  ProductServiceContext,
  ProductType,
} from "../types.js";

function assertCompany(ctx: ProductServiceContext, companyId: string) {
  if (!ctx.isSuperAdmin && ctx.companyId !== companyId) {
    throw new ProductPermissionError("tenant");
  }
}

function assertPermission(ctx: ProductServiceContext, code: string) {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(code)) throw new ProductPermissionError(code);
}

export class ProductQueryService {
  constructor(private readonly deps: { products: ProductRepository }) {}

  async getProduct(
    ctx: ProductServiceContext,
    companyId: string,
    productId: string,
  ): Promise<CatalogProductRecord | null> {
    assertCompany(ctx, companyId);
    assertPermission(ctx, PRODUCT_PERMISSIONS.view);
    return this.deps.products.getProduct(companyId, productId);
  }

  async listProducts(
    ctx: ProductServiceContext,
    input: {
      companyId: string;
      categoryId?: string;
      productType?: ProductType;
      query?: string;
      activeOnly?: boolean;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ items: CatalogProductRecord[]; total: number }> {
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, PRODUCT_PERMISSIONS.view);
    return this.deps.products.listProducts({
      companyId: input.companyId,
      categoryId: input.categoryId,
      productType: input.productType,
      query: input.query,
      activeOnly: input.activeOnly,
      limit: input.limit ?? 50,
      offset: input.offset ?? 0,
    });
  }

  async listCategories(
    ctx: ProductServiceContext,
    companyId: string,
  ): Promise<ProductCategoryRecord[]> {
    assertCompany(ctx, companyId);
    assertPermission(ctx, PRODUCT_PERMISSIONS.view);
    return this.deps.products.listCategories(companyId);
  }

  async listRegionalPrices(
    ctx: ProductServiceContext,
    companyId: string,
    productId: string,
  ): Promise<ProductRegionalPriceRecord[]> {
    assertCompany(ctx, companyId);
    assertPermission(ctx, PRODUCT_PERMISSIONS.view);
    return this.deps.products.listRegionalPrices(companyId, productId);
  }

  async listBundleItems(
    ctx: ProductServiceContext,
    companyId: string,
    bundleProductId: string,
  ): Promise<ProductBundleItemRecord[]> {
    assertCompany(ctx, companyId);
    assertPermission(ctx, PRODUCT_PERMISSIONS.view);
    return this.deps.products.listBundleItems(companyId, bundleProductId);
  }

  async listHistory(
    ctx: ProductServiceContext,
    companyId: string,
    productId: string,
  ): Promise<ProductHistoryRecord[]> {
    assertCompany(ctx, companyId);
    assertPermission(ctx, PRODUCT_PERMISSIONS.view);
    return this.deps.products.listHistory(companyId, productId);
  }

  async listOpportunityLines(
    ctx: ProductServiceContext,
    companyId: string,
    opportunityId: string,
  ): Promise<OpportunityLineItemRecord[]> {
    assertCompany(ctx, companyId);
    if (
      !ctx.isSuperAdmin &&
      !ctx.hasPermission("opportunities.view") &&
      !ctx.hasPermission(PRODUCT_PERMISSIONS.view)
    ) {
      throw new ProductPermissionError("opportunities.view");
    }
    return this.deps.products.listOpportunityLines(companyId, opportunityId);
  }
}
