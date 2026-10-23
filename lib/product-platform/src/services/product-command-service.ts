import { PRODUCT_PERMISSIONS, PRODUCT_TYPES } from "../constants.js";
import {
  formatLineFieldChangeSummary,
  formatProductAttachedSummary,
  formatProductRemovedSummary,
} from "@workspace/opportunity-platform";
import {
  ProductNotFoundError,
  ProductPermissionError,
  ProductValidationError,
} from "../errors.js";
import type { ProductRepository } from "../repositories/product-repository-port.js";
import {
  normalizePriceTaxMode,
  parseTaxPercentInput,
  type ProductPriceTaxMode,
} from "../product-tax.js";
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
import { normalizeProductAliases } from "../product-aliases.js";
import { isProductAliasGenerationEnabled } from "../product-alias-generation-flag.js";
import {
  productAliasContentFingerprint,
  withAliasGenerationMeta,
  type ProductAliasContentFields,
} from "../product-alias-generation.js";
import type { ProductAliasGenerationSchedulerPort } from "./product-alias-generation-service.js";

function resolvedAliases(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  try {
    return normalizeProductAliases(value);
  } catch (error) {
    throw new ProductValidationError(error instanceof Error ? error.message : "Invalid aliases.");
  }
}

function aliasContentFields(input: {
  name: string;
  description?: string | null;
  productType?: string | null;
  categoryId?: string | null;
  brand?: string | null;
  tags?: readonly string[] | null;
}): ProductAliasContentFields {
  return {
    name: input.name,
    description: input.description,
    productType: input.productType,
    categoryId: input.categoryId,
    brand: input.brand,
    tags: input.tags,
  };
}

function resolvedTaxPercent(value: unknown, fallback = 0): number {
  if (value === undefined) return fallback;
  const parsed = parseTaxPercentInput(value);
  if (parsed == null) throw new ProductValidationError("Tax percent must be between 0 and 100.");
  return parsed;
}

const PRODUCT_IMAGE_LIMIT = 5;
const CATALOG_IMAGE_URL =
  /^(https:\/\/\S+|http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/storage\/v1\/object\/public\/company-branding\/\S+)$/;

function catalogImageUrls(urls: readonly string[]): string[] {
  const images: string[] = [];
  for (const raw of urls) {
    const url = raw.trim();
    if (!url || url.length > 2048 || !CATALOG_IMAGE_URL.test(url) || images.includes(url)) continue;
    images.push(url);
    if (images.length >= PRODUCT_IMAGE_LIMIT) break;
  }
  return images;
}

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

export type OpportunityHistoryRecorderPort = {
  addHistory(input: {
    companyId: string;
    opportunityId: string;
    eventType: string;
    fieldName?: string | null;
    previousValue?: string | null;
    newValue?: string | null;
    summary: string;
    payload?: Record<string, unknown>;
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
      opportunityHistory?: OpportunityHistoryRecorderPort;
      /** Optional background AI alias generation (never blocks create/update success). */
      aliasGeneration?: ProductAliasGenerationSchedulerPort;
      /**
       * Optional browser/host flag reader. Prefer this in Vite so `import.meta.env`
       * is evaluated in the app bundle (not an optimized workspace dependency).
       */
      isAliasGenerationEnabled?: () => boolean;
    },
  ) {}

  private isAliasGenerationActive(): boolean {
    try {
      if (!this.deps.aliasGeneration) return false;
      if (this.deps.isAliasGenerationEnabled) {
        return Boolean(this.deps.isAliasGenerationEnabled());
      }
      return isProductAliasGenerationEnabled();
    } catch {
      // Browser/runtime flag failures must never block product create/update.
      return false;
    }
  }

  private scheduleAliasGeneration(input: {
    companyId: string;
    productId: string;
    fingerprint: string;
    requestedAt: string;
    actorUserId: string | null;
  }): void {
    if (!this.isAliasGenerationActive()) return;
    try {
      this.deps.aliasGeneration!.schedule(input);
    } catch {
      // Generation must never fail product save.
    }
  }

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
      priceTaxMode?: ProductPriceTaxMode;
      taxPercent?: number;
      cost?: number | null;
      subscriptionInterval?: CatalogProductRecord["subscriptionInterval"];
      subscriptionPrice?: number | null;
      unit?: string;
      trackInventory?: boolean;
      stockQuantity?: number | null;
      tags?: string[];
      aliases?: string[];
      imageUrls?: string[];
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
    const priceTaxMode = normalizePriceTaxMode(input.priceTaxMode);
    const taxPercent = resolvedTaxPercent(input.taxPercent);

    const name = input.name.trim();
    const description = input.description;
    const brand = input.brand;
    const tags = input.tags;
    const categoryId = input.categoryId ?? null;
    const shouldGenerateAliases = this.isAliasGenerationActive() && Boolean(name);
    const fingerprint = productAliasContentFingerprint(
      aliasContentFields({
        name,
        description,
        productType,
        categoryId,
        brand,
        tags,
      }),
    );
    const requestedAt = new Date().toISOString();
    const metadata = shouldGenerateAliases
      ? withAliasGenerationMeta(
          {},
          { status: "pending", fingerprint, requestedAt },
        )
      : undefined;

    const product = await this.deps.products.createProduct({
      companyId: input.companyId,
      categoryId,
      productType,
      name,
      sku: input.sku.trim(),
      brand,
      description,
      basePrice,
      currency: input.currency ?? "USD",
      taxClass: input.taxClass,
      priceTaxMode,
      taxPercent,
      cost: input.cost ?? null,
      marginPercent,
      subscriptionInterval: input.subscriptionInterval ?? null,
      subscriptionPrice: input.subscriptionPrice ?? null,
      unit: input.unit?.trim() || "each",
      trackInventory: input.trackInventory ?? false,
      stockQuantity: input.trackInventory ? (input.stockQuantity ?? 0) : null,
      tags,
      aliases: resolvedAliases(input.aliases) ?? [],
      imageUrls: catalogImageUrls(input.imageUrls ?? []),
      metadata,
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

    if (shouldGenerateAliases) {
      this.scheduleAliasGeneration({
        companyId: input.companyId,
        productId: product.id,
        fingerprint,
        requestedAt,
        actorUserId: actor,
      });
    }

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
      priceTaxMode?: ProductPriceTaxMode;
      taxPercent?: number;
      cost?: number | null;
      isActive?: boolean;
      productType?: ProductType;
      subscriptionInterval?: CatalogProductRecord["subscriptionInterval"];
      subscriptionPrice?: number | null;
      unit?: string;
      trackInventory?: boolean;
      stockQuantity?: number | null;
      tags?: string[];
      aliases?: string[];
      documentUrls?: string[];
      imageUrls?: string[];
    },
  ): Promise<{ product: CatalogProductRecord }> {
    const actor = assertActor(ctx);
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, PRODUCT_PERMISSIONS.edit);

    const existing = await this.deps.products.getProduct(input.companyId, input.productId);
    if (!existing) throw new ProductNotFoundError(input.productId);

    const needsPricing =
      input.basePrice !== undefined ||
      input.cost !== undefined ||
      input.priceTaxMode !== undefined ||
      input.taxPercent !== undefined;
    if (needsPricing) assertPermission(ctx, PRODUCT_PERMISSIONS.pricing);

    const basePrice = input.basePrice ?? existing.basePrice;
    const cost = input.cost !== undefined ? input.cost : existing.cost;
    const marginPercent = computeMarginPercent(basePrice, cost);
    const priceTaxMode =
      input.priceTaxMode === undefined ? undefined : normalizePriceTaxMode(input.priceTaxMode);
    const taxPercent =
      input.taxPercent === undefined ? undefined : resolvedTaxPercent(input.taxPercent);

    const nextContent = aliasContentFields({
      name: input.name ?? existing.name,
      description: input.description ?? existing.description,
      productType: input.productType ?? existing.productType,
      categoryId: input.categoryId !== undefined ? input.categoryId : existing.categoryId,
      brand: input.brand ?? existing.brand,
      tags: input.tags ?? existing.tags,
    });
    const nextFingerprint = productAliasContentFingerprint(nextContent);
    const previousFingerprint = productAliasContentFingerprint(existing);
    const contentChangedForAliases = nextFingerprint !== previousFingerprint;
    const nextIsActive = input.isActive === undefined ? existing.isActive : input.isActive;
    const shouldGenerateAliases =
      this.isAliasGenerationActive() &&
      contentChangedForAliases &&
      nextIsActive &&
      Boolean(nextContent.name.trim());
    const requestedAt = new Date().toISOString();
    const metadata = shouldGenerateAliases
      ? withAliasGenerationMeta(existing.metadata, {
          status: "pending",
          fingerprint: nextFingerprint,
          requestedAt,
        })
      : undefined;

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
      priceTaxMode,
      taxPercent,
      cost: input.cost,
      marginPercent,
      isActive: input.isActive,
      productType: input.productType,
      subscriptionInterval: input.subscriptionInterval,
      subscriptionPrice: input.subscriptionPrice,
      unit: input.unit,
      trackInventory: input.trackInventory,
      stockQuantity:
        input.trackInventory === false ? null : input.stockQuantity,
      tags: input.tags,
      aliases: resolvedAliases(input.aliases),
      documentUrls: input.documentUrls,
      imageUrls: input.imageUrls === undefined ? undefined : catalogImageUrls(input.imageUrls),
      metadata,
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

    if (priceTaxMode !== undefined && priceTaxMode !== existing.priceTaxMode) {
      await this.deps.products.addHistory({
        companyId: input.companyId,
        productId: product.id,
        eventType: "price_changed",
        fieldName: "price_tax_mode",
        previousValue: existing.priceTaxMode,
        newValue: priceTaxMode,
        summary: `Price tax mode changed to ${priceTaxMode}`,
        actorUserId: actor,
      });
    }

    if (taxPercent !== undefined && taxPercent !== existing.taxPercent) {
      await this.deps.products.addHistory({
        companyId: input.companyId,
        productId: product.id,
        eventType: "price_changed",
        fieldName: "tax_percent",
        previousValue: String(existing.taxPercent),
        newValue: String(taxPercent),
        summary: `Tax percent changed to ${taxPercent}`,
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

    if (shouldGenerateAliases) {
      this.scheduleAliasGeneration({
        companyId: input.companyId,
        productId: product.id,
        fingerprint: nextFingerprint,
        requestedAt,
        actorUserId: actor,
      });
    }

    return { product };
  }

  /**
   * Re-run AI alias generation for an existing product without requiring a content edit.
   * Used after a failed provider call. Never blocks product usability if generation fails again.
   */
  async regenerateProductAliases(
    ctx: ProductServiceContext,
    input: { companyId: string; productId: string },
  ): Promise<{ product: CatalogProductRecord }> {
    const actor = assertActor(ctx);
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, PRODUCT_PERMISSIONS.edit);

    if (!this.isAliasGenerationActive()) {
      throw new ProductValidationError("Automatic alias generation is not enabled.");
    }

    const existing = await this.deps.products.getProduct(input.companyId, input.productId);
    if (!existing) throw new ProductNotFoundError(input.productId);
    if (!existing.isActive) {
      throw new ProductValidationError("Alias generation requires an active product.");
    }

    const fingerprint = productAliasContentFingerprint(
      aliasContentFields({
        name: existing.name,
        description: existing.description,
        productType: existing.productType,
        categoryId: existing.categoryId,
        brand: existing.brand,
        tags: existing.tags,
      }),
    );
    const requestedAt = new Date().toISOString();
    const product = await this.deps.products.updateProduct({
      companyId: input.companyId,
      productId: input.productId,
      updatedBy: actor,
      metadata: withAliasGenerationMeta(existing.metadata, {
        status: "pending",
        fingerprint,
        requestedAt,
      }),
    });

    this.scheduleAliasGeneration({
      companyId: input.companyId,
      productId: product.id,
      fingerprint,
      requestedAt,
      actorUserId: actor,
    });

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

    const opportunityCurrency = await this.deps.products.getOpportunityCurrency(
      input.companyId,
      input.opportunityId,
    );
    if (!opportunityCurrency) throw new ProductValidationError("Opportunity not found.");

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
      currency: opportunityCurrency,
      ...amounts,
      actorUserId: actor,
    });

    await this.deps.events.publishOpportunityProductsAdded({
      opportunityId: input.opportunityId,
      productIds: [product.id],
      companyId: input.companyId,
      actorUserId: actor,
    });

    await this.deps.opportunityHistory?.addHistory({
      companyId: input.companyId,
      opportunityId: input.opportunityId,
      eventType: "product_attached",
      summary: formatProductAttachedSummary({
        productName: product.name,
        quantity,
        unitPrice,
        currency: opportunityCurrency,
      }),
      payload: {
        lineId: line.id,
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        quantity,
        unitPrice,
        currency: opportunityCurrency,
      },
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

    const linePayload = {
      lineId: line.id,
      productId: existing.productId,
      productName: existing.productNameSnapshot,
      sku: existing.skuSnapshot,
      currency: existing.currency,
    };

    if (input.quantity !== undefined && input.quantity !== existing.quantity) {
      await this.deps.opportunityHistory?.addHistory({
        companyId: input.companyId,
        opportunityId: input.opportunityId,
        eventType: "quantity_changed",
        fieldName: "quantity",
        previousValue: String(existing.quantity),
        newValue: String(quantity),
        summary: formatLineFieldChangeSummary("Quantity"),
        payload: linePayload,
        actorUserId: actor,
      });
    }

    if (input.unitPrice !== undefined && input.unitPrice !== existing.unitPrice) {
      await this.deps.opportunityHistory?.addHistory({
        companyId: input.companyId,
        opportunityId: input.opportunityId,
        eventType: "unit_price_changed",
        fieldName: "unit_price",
        previousValue: String(existing.unitPrice),
        newValue: String(unitPrice),
        summary: formatLineFieldChangeSummary("Unit price"),
        payload: linePayload,
        actorUserId: actor,
      });
    }

    if (input.discountPercent !== undefined && input.discountPercent !== existing.discountPercent) {
      await this.deps.opportunityHistory?.addHistory({
        companyId: input.companyId,
        opportunityId: input.opportunityId,
        eventType: "discount_changed",
        fieldName: "discount_percent",
        previousValue: String(existing.discountPercent),
        newValue: String(discountPercent),
        summary: formatLineFieldChangeSummary("Discount"),
        payload: linePayload,
        actorUserId: actor,
      });
    }

    if (input.taxPercent !== undefined && input.taxPercent !== existing.taxPercent) {
      await this.deps.opportunityHistory?.addHistory({
        companyId: input.companyId,
        opportunityId: input.opportunityId,
        eventType: "tax_changed",
        fieldName: "tax_percent",
        previousValue: String(existing.taxPercent),
        newValue: String(taxPercent),
        summary: formatLineFieldChangeSummary("Tax"),
        payload: linePayload,
        actorUserId: actor,
      });
    }

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

    const existing = await this.deps.products.getOpportunityLine(input.companyId, input.lineId);
    if (!existing) throw new ProductValidationError("Line item not found.");

    await this.deps.products.removeOpportunityLine(input.companyId, input.lineId, actor);

    await this.deps.opportunityHistory?.addHistory({
      companyId: input.companyId,
      opportunityId: existing.opportunityId,
      eventType: "product_removed",
      summary: formatProductRemovedSummary({
        productName: existing.productNameSnapshot,
        quantity: existing.quantity,
        unitPrice: existing.unitPrice,
        currency: existing.currency,
      }),
      payload: {
        lineId: existing.id,
        productId: existing.productId,
        productName: existing.productNameSnapshot,
        sku: existing.skuSnapshot,
        quantity: existing.quantity,
        unitPrice: existing.unitPrice,
        currency: existing.currency,
      },
      actorUserId: actor,
    });
  }
}
