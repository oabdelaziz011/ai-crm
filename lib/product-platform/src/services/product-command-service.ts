import { PRODUCT_PERMISSIONS, PRODUCT_TYPES } from "../constants.js";
import {
  ProductNotFoundError,
  ProductPermissionError,
  ProductValidationError,
} from "../errors.js";
import type { ProductRepository } from "../repositories/product-repository-port.js";
import {
  computeLineAmounts,
  computeMarginPercent,
  resolveEffectivePrice,
  type CatalogProductRecord,
  type OpportunityLineItemRecord,
  type ProductCategoryRecord,
  type ProductRegionalPriceRecord,
  type ProductServiceContext,
  type ProductType,
} from "../types.js";

export type ProductEventPublisherPort = {
  publishCreated(input: {
    productId: string;
    name: string;
    sku: string;
    productType: string;
    companyId: string;
    actorUserId: string | null;
  }): Promise<void>;
  publishUpdated(input: {
    productId: string;
    changedFields: string[];
    companyId: string;
    actorUserId: string | null;
  }): Promise<void>;
  publishArchived(input: {
    productId: string;
    companyId: string;
    actorUserId: string | null;
  }): Promise<void>;
  publishPriceChanged(input: {
    productId: string;
    previousPrice: number;
    nextPrice: number;
    currency: string;
    companyId: string;
    actorUserId: string | null;
  }): Promise<void>;
  publishCategoryChanged(input: {
    productId: string;
    previousCategoryId: string | null;
    nextCategoryId: string | null;
    companyId: string;
    actorUserId: string | null;
  }): Promise<void>;
  publishOpportunityProductsAdded(input: {
    opportunityId: string;
    productIds: string[];
    companyId: string;
    actorUserId: string | null;
  }): Promise<void>;
};

function assertActor(ctx: ProductServiceContext): string {
  if (!ctx.userId) throw new ProductValidationError("Authenticated actor required.");
  return ctx.userId;
}

function assertCompany(ctx: ProductServiceContext, companyId: string) {
  if (!ctx.isSuperAdmin && ctx.companyId !== companyId) {
    throw new ProductPermissionError("tenant");
  }
}

function assertPermission(ctx: ProductServiceContext, code: string) {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(code)) throw new ProductPermissionError(code);
}

export class ProductCommandService {
  constructor(
    private readonly deps: {
      products: ProductRepository;
      events: ProductEventPublisherPort;
    },
  ) {}

  async createCategory(
    ctx: ProductServiceContext,
    input: {
      companyId: string;
      name: string;
      parentId?: string | null;
      description?: string;
      slug?: string;
    },
  ): Promise<{ category: ProductCategoryRecord }> {
    const actor = assertActor(ctx);
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, PRODUCT_PERMISSIONS.create);
    const category = await this.deps.products.createCategory({
      companyId: input.companyId,
      name: input.name,
      parentId: input.parentId,
      description: input.description,
      slug: input.slug ?? "",
      createdBy: actor,
    });
    return { category };
  }

  async createProduct(
    ctx: ProductServiceContext,
    input: {
      companyId: string;
      name: string;
      sku: string;
      productType?: ProductType;
      categoryId?: string | null;
      brand?: string;
      description?: string;
      basePrice?: number;
      currency?: string;
      taxClass?: string;
      cost?: number | null;
      subscriptionInterval?: CatalogProductRecord["subscriptionInterval"];
      subscriptionPrice?: number | null;
      tags?: string[];
    },
  ): Promise<{ product: CatalogProductRecord }> {
    const actor = assertActor(ctx);
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, PRODUCT_PERMISSIONS.create);

    const productType = input.productType ?? "product";
    if (!(PRODUCT_TYPES as readonly string[]).includes(productType)) {
      throw new ProductValidationError("Invalid product type.");
    }
    if (!input.sku.trim()) throw new ProductValidationError("SKU is required.");

    const basePrice = input.basePrice ?? 0;
    const marginPercent = computeMarginPercent(basePrice, input.cost ?? null);

    const product = await this.deps.products.createProduct({
      companyId: input.companyId,
      categoryId: input.categoryId ?? null,
      productType,
      name: input.name.trim(),
      sku: input.sku.trim(),
      brand: input.brand,
      description: input.description,
      basePrice,
      currency: input.currency ?? "USD",
      taxClass: input.taxClass,
      cost: input.cost ?? null,
      marginPercent,
      subscriptionInterval: input.subscriptionInterval ?? null,
      subscriptionPrice: input.subscriptionPrice ?? null,
      tags: input.tags,
      createdBy: actor,
    });

    await this.deps.products.addHistory({
      companyId: input.companyId,
      productId: product.id,
      eventType: "product_created",
      summary: `Product created: ${product.name}`,
      actorUserId: actor,
    });

    await this.deps.events.publishCreated({
      productId: product.id,
      name: product.name,
      sku: product.sku,
      productType: product.productType,
      companyId: input.companyId,
      actorUserId: actor,
    });

    return { product };
  }

  async updateProduct(
    ctx: ProductServiceContext,
    input: {
      companyId: string;
      productId: string;
      name?: string;
      sku?: string;
      categoryId?: string | null;
      brand?: string;
      description?: string;
      basePrice?: number;
      currency?: string;
      taxClass?: string;
      cost?: number | null;
      isActive?: boolean;
      productType?: ProductType;
      subscriptionInterval?: CatalogProductRecord["subscriptionInterval"];
      subscriptionPrice?: number | null;
      tags?: string[];
      documentUrls?: string[];
      imageUrls?: string[];
    },
  ): Promise<{ product: CatalogProductRecord }> {
    const actor = assertActor(ctx);
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, PRODUCT_PERMISSIONS.edit);

    const existing = await this.deps.products.getProduct(input.companyId, input.productId);
    if (!existing) throw new ProductNotFoundError(input.productId);

    const needsPricing = input.basePrice !== undefined || input.cost !== undefined;
    if (needsPricing) assertPermission(ctx, PRODUCT_PERMISSIONS.pricing);

    const basePrice = input.basePrice ?? existing.basePrice;
    const cost = input.cost !== undefined ? input.cost : existing.cost;
    const marginPercent = computeMarginPercent(basePrice, cost);

    const product = await this.deps.products.updateProduct({
      companyId: input.companyId,
      productId: input.productId,
      updatedBy: actor,
      name: input.name,
      sku: input.sku,
      categoryId: input.categoryId,
      brand: input.brand,
      description: input.description,
      basePrice: input.basePrice,
      currency: input.currency,
      taxClass: input.taxClass,
      cost: input.cost,
      marginPercent,
      isActive: input.isActive,
      productType: input.productType,
      subscriptionInterval: input.subscriptionInterval,
      subscriptionPrice: input.subscriptionPrice,
      tags: input.tags,
      documentUrls: input.documentUrls,
      imageUrls: input.imageUrls,
    });

    const changedFields = Object.keys(input).filter(
      (k) => !["companyId", "productId"].includes(k) && (input as Record<string, unknown>)[k] !== undefined,
    );

    await this.deps.products.addHistory({
      companyId: input.companyId,
      productId: product.id,
      eventType: "product_updated",
      summary: `Product updated (${changedFields.join(", ")})`,
      actorUserId: actor,
    });

    await this.deps.events.publishUpdated({
      productId: product.id,
      changedFields,
      companyId: input.companyId,
      actorUserId: actor,
    });

    if (input.basePrice !== undefined && input.basePrice !== existing.basePrice) {
      await this.deps.products.addHistory({
        companyId: input.companyId,
        productId: product.id,
        eventType: "price_changed",
        fieldName: "base_price",
        previousValue: String(existing.basePrice),
        newValue: String(input.basePrice),
        summary: `Base price changed to ${input.basePrice}`,
        actorUserId: actor,
      });
      await this.deps.events.publishPriceChanged({
        productId: product.id,
        previousPrice: existing.basePrice,
        nextPrice: input.basePrice,
        currency: product.currency,
        companyId: input.companyId,
        actorUserId: actor,
      });
    }

    if (input.categoryId !== undefined && input.categoryId !== existing.categoryId) {
      await this.deps.products.addHistory({
        companyId: input.companyId,
        productId: product.id,
        eventType: "category_changed",
        fieldName: "category_id",
        previousValue: existing.categoryId,
        newValue: input.categoryId,
        summary: "Category changed",
        actorUserId: actor,
      });
      await this.deps.events.publishCategoryChanged({
        productId: product.id,
        previousCategoryId: existing.categoryId,
        nextCategoryId: input.categoryId,
        companyId: input.companyId,
        actorUserId: actor,
      });
    }

    return { product };
  }

  async archiveProduct(
    ctx: ProductServiceContext,
    input: { companyId: string; productId: string },
  ): Promise<void> {
    const actor = assertActor(ctx);
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, PRODUCT_PERMISSIONS.delete);
    await this.deps.products.softDeleteProduct(input.companyId, input.productId, actor);
    await this.deps.products.addHistory({
      companyId: input.companyId,
      productId: input.productId,
      eventType: "product_archived",
      summary: "Product archived",
      actorUserId: actor,
    });
    await this.deps.events.publishArchived({
      productId: input.productId,
      companyId: input.companyId,
      actorUserId: actor,
    });
  }

  async upsertRegionalPrice(
    ctx: ProductServiceContext,
    input: {
      companyId: string;
      productId: string;
      id?: string;
      country?: string | null;
      market?: string | null;
      region?: string | null;
      localPrice: number;
      currencyOverride?: string | null;
    },
  ): Promise<{ price: ProductRegionalPriceRecord }> {
    const actor = assertActor(ctx);
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, PRODUCT_PERMISSIONS.pricing);

    const product = await this.deps.products.getProduct(input.companyId, input.productId);
    if (!product) throw new ProductNotFoundError(input.productId);

    const price = await this.deps.products.upsertRegionalPrice({
      ...input,
      actorUserId: actor,
    });

    await this.deps.products.addHistory({
      companyId: input.companyId,
      productId: input.productId,
      eventType: "regional_price_changed",
      summary: `Regional price ${price.localPrice}`,
      payload: { country: price.country, market: price.market, region: price.region },
      actorUserId: actor,
    });

    return { price };
  }

  async setBundleItems(
    ctx: ProductServiceContext,
    input: {
      companyId: string;
      bundleProductId: string;
      items: Array<{ componentProductId: string; quantity: number }>;
    },
  ): Promise<{ items: Awaited<ReturnType<ProductRepository["setBundleItems"]>> }> {
    const actor = assertActor(ctx);
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, PRODUCT_PERMISSIONS.edit);

    const bundle = await this.deps.products.getProduct(input.companyId, input.bundleProductId);
    if (!bundle) throw new ProductNotFoundError(input.bundleProductId);
    if (bundle.productType !== "bundle") {
      throw new ProductValidationError("Only bundle products can have components.");
    }

    const items = await this.deps.products.setBundleItems(input);
    await this.deps.products.addHistory({
      companyId: input.companyId,
      productId: input.bundleProductId,
      eventType: "bundle_updated",
      summary: `Bundle components updated (${items.length})`,
      actorUserId: actor,
    });
    return { items };
  }

  async attachProductToOpportunity(
    ctx: ProductServiceContext,
    input: {
      companyId: string;
      opportunityId: string;
      productId: string;
      quantity?: number;
      discountPercent?: number;
      taxPercent?: number;
      country?: string | null;
      market?: string | null;
      region?: string | null;
      unitPriceOverride?: number;
    },
  ): Promise<{ line: OpportunityLineItemRecord }> {
    const actor = assertActor(ctx);
    assertCompany(ctx, input.companyId);
    // Attaching uses opportunities.edit OR products.view + opportunities - require opportunities.edit via app layer typically
    if (!ctx.isSuperAdmin && !ctx.hasPermission("opportunities.edit") && !ctx.hasPermission(PRODUCT_PERMISSIONS.view)) {
      throw new ProductPermissionError("opportunities.edit");
    }

    const product = await this.deps.products.getProduct(input.companyId, input.productId);
    if (!product || !product.isActive) throw new ProductNotFoundError(input.productId);

    const regional = await this.deps.products.listRegionalPrices(input.companyId, product.id);
    const priced = resolveEffectivePrice({
      basePrice:
        product.productType === "subscription" && product.subscriptionPrice != null
          ? product.subscriptionPrice
          : product.basePrice,
      currency: product.currency,
      regionalPrices: regional,
      country: input.country,
      market: input.market,
      region: input.region,
    });

    const unitPrice = input.unitPriceOverride ?? priced.unitPrice;
    const quantity = input.quantity ?? 1;
    const discountPercent = input.discountPercent ?? 0;
    const taxPercent = input.taxPercent ?? 0;
    const amounts = computeLineAmounts({ quantity, unitPrice, discountPercent, taxPercent });

    const line = await this.deps.products.upsertOpportunityLine({
      companyId: input.companyId,
      opportunityId: input.opportunityId,
      productId: product.id,
      productNameSnapshot: product.name,
      skuSnapshot: product.sku,
      quantity,
      unitPrice,
      discountPercent,
      taxPercent,
      currency: priced.currency,
      ...amounts,
      actorUserId: actor,
    });

    await this.deps.events.publishOpportunityProductsAdded({
      opportunityId: input.opportunityId,
      productIds: [product.id],
      companyId: input.companyId,
      actorUserId: actor,
    });

    return { line };
  }

  async updateOpportunityLine(
    ctx: ProductServiceContext,
    input: {
      companyId: string;
      opportunityId: string;
      lineId: string;
      quantity?: number;
      unitPrice?: number;
      discountPercent?: number;
      taxPercent?: number;
    },
  ): Promise<{ line: OpportunityLineItemRecord }> {
    const actor = assertActor(ctx);
    assertCompany(ctx, input.companyId);
    if (!ctx.isSuperAdmin && !ctx.hasPermission("opportunities.edit")) {
      throw new ProductPermissionError("opportunities.edit");
    }

    const lines = await this.deps.products.listOpportunityLines(input.companyId, input.opportunityId);
    const existing = lines.find((l) => l.id === input.lineId);
    if (!existing) throw new ProductValidationError("Line item not found.");

    const quantity = input.quantity ?? existing.quantity;
    const unitPrice = input.unitPrice ?? existing.unitPrice;
    const discountPercent = input.discountPercent ?? existing.discountPercent;
    const taxPercent = input.taxPercent ?? existing.taxPercent;
    const amounts = computeLineAmounts({ quantity, unitPrice, discountPercent, taxPercent });

    const line = await this.deps.products.upsertOpportunityLine({
      companyId: input.companyId,
      opportunityId: input.opportunityId,
      id: input.lineId,
      productId: existing.productId,
      productNameSnapshot: existing.productNameSnapshot,
      skuSnapshot: existing.skuSnapshot,
      quantity,
      unitPrice,
      discountPercent,
      taxPercent,
      currency: existing.currency,
      ...amounts,
      sortOrder: existing.sortOrder,
      actorUserId: actor,
    });

    return { line };
  }

  async removeOpportunityLine(
    ctx: ProductServiceContext,
    input: { companyId: string; lineId: string },
  ): Promise<void> {
    const actor = assertActor(ctx);
    assertCompany(ctx, input.companyId);
    if (!ctx.isSuperAdmin && !ctx.hasPermission("opportunities.edit")) {
      throw new ProductPermissionError("opportunities.edit");
    }
    await this.deps.products.removeOpportunityLine(input.companyId, input.lineId, actor);
  }
}
