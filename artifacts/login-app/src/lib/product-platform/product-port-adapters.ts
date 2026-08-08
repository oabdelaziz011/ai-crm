import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductReadPort, ProductWritePort } from "@workspace/application-layer";
import type { ProductServiceContext, ProductType } from "@workspace/product-platform";
import type { LoginAppPortContext } from "../adapters/customer-read-port-adapter.js";
import {
  createLoginAppProductPlatformServices,
  mapCatalogProduct,
} from "./product-platform-factory.js";

function buildContext(ctx: LoginAppPortContext, tenantId: string): ProductServiceContext {
  return {
    userId: ctx.actorUserId,
    companyId: tenantId,
    isSuperAdmin: ctx.isSuperAdmin,
    hasPermission: ctx.hasPermission,
  };
}

export function createLoginAppProductReadPort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): ProductReadPort {
  const platform = createLoginAppProductPlatformServices(client);
  const assertTenant = (tenantId: string) => {
    if (tenantId !== ctx.companyId && !ctx.isSuperAdmin) throw new Error("Permission denied");
  };

  return {
    async getById(tenantId, productId) {
      assertTenant(tenantId);
      const record = await platform.queries.getProduct(buildContext(ctx, tenantId), tenantId, productId);
      return record ? mapCatalogProduct(record) : null;
    },
    async list(tenantId, filter) {
      assertTenant(tenantId);
      const result = await platform.queries.listProducts(buildContext(ctx, tenantId), {
        companyId: tenantId,
        categoryId: filter?.categoryId,
        productType: filter?.productType as ProductType | undefined,
        query: filter?.query,
        activeOnly: filter?.activeOnly,
        limit: filter?.limit,
        offset: filter?.offset,
      });
      return {
        items: Object.freeze(result.items.map(mapCatalogProduct)),
        total: result.total,
      };
    },
    async listCategories(tenantId) {
      assertTenant(tenantId);
      const rows = await platform.queries.listCategories(buildContext(ctx, tenantId), tenantId);
      return rows.map((c) =>
        Object.freeze({
          id: c.id,
          tenantId: c.companyId,
          parentId: c.parentId,
          name: c.name,
          slug: c.slug,
          description: c.description,
          sortOrder: c.sortOrder,
          isActive: c.isActive,
        }),
      );
    },
    async listRegionalPrices(tenantId, productId) {
      assertTenant(tenantId);
      const rows = await platform.queries.listRegionalPrices(
        buildContext(ctx, tenantId),
        tenantId,
        productId,
      );
      return rows.map((p) =>
        Object.freeze({
          id: p.id,
          productId: p.productId,
          country: p.country,
          market: p.market,
          region: p.region,
          localPrice: p.localPrice,
          currencyOverride: p.currencyOverride,
          isActive: p.isActive,
        }),
      );
    },
    async listHistory(tenantId, productId) {
      assertTenant(tenantId);
      const rows = await platform.queries.listHistory(buildContext(ctx, tenantId), tenantId, productId);
      return rows.map((h) =>
        Object.freeze({
          id: h.id,
          productId: h.productId,
          eventType: h.eventType,
          summary: h.summary,
          fieldName: h.fieldName,
          previousValue: h.previousValue,
          newValue: h.newValue,
          createdAt: h.createdAt,
        }),
      );
    },
    async listOpportunityLines(tenantId, opportunityId) {
      assertTenant(tenantId);
      const rows = await platform.queries.listOpportunityLines(
        buildContext(ctx, tenantId),
        tenantId,
        opportunityId,
      );
      return rows.map((l) =>
        Object.freeze({
          id: l.id,
          opportunityId: l.opportunityId,
          productId: l.productId,
          productName: l.productNameSnapshot,
          sku: l.skuSnapshot,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountPercent: l.discountPercent,
          taxPercent: l.taxPercent,
          currency: l.currency,
          subtotal: l.subtotal,
          taxAmount: l.taxAmount,
          total: l.total,
        }),
      );
    },
  };
}

export function createLoginAppProductWritePort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): ProductWritePort {
  const platform = createLoginAppProductPlatformServices(client);
  const assertTenant = (tenantId: string) => {
    if (tenantId !== ctx.companyId && !ctx.isSuperAdmin) throw new Error("Permission denied");
  };

  return {
    async create(input) {
      assertTenant(input.tenantId);
      const { product } = await platform.commands.createProduct(buildContext(ctx, input.tenantId), {
        companyId: input.tenantId,
        name: input.name,
        sku: input.sku,
        productType: input.productType as ProductType | undefined,
        categoryId: input.categoryId,
        brand: input.brand,
        description: input.description,
        basePrice: input.basePrice,
        currency: input.currency,
        taxClass: input.taxClass,
        cost: input.cost,
        tags: input.tags ? [...input.tags] : undefined,
      });
      return mapCatalogProduct(product);
    },
    async update(tenantId, productId, patch) {
      assertTenant(tenantId);
      const { product } = await platform.commands.updateProduct(buildContext(ctx, tenantId), {
        companyId: tenantId,
        productId,
        name: patch.name,
        sku: patch.sku,
        categoryId: patch.categoryId,
        brand: patch.brand,
        description: patch.description,
        basePrice: patch.basePrice,
        currency: patch.currency,
        taxClass: patch.taxClass,
        cost: patch.cost,
        isActive: patch.isActive,
        productType: patch.productType as ProductType | undefined,
        tags: patch.tags ? [...patch.tags] : undefined,
        documentUrls: patch.documentUrls ? [...patch.documentUrls] : undefined,
        imageUrls: patch.imageUrls ? [...patch.imageUrls] : undefined,
      });
      return mapCatalogProduct(product);
    },
    async archive(tenantId, productId) {
      assertTenant(tenantId);
      await platform.commands.archiveProduct(buildContext(ctx, tenantId), {
        companyId: tenantId,
        productId,
      });
    },
    async createCategory(input) {
      assertTenant(input.tenantId);
      const { category } = await platform.commands.createCategory(buildContext(ctx, input.tenantId), {
        companyId: input.tenantId,
        name: input.name,
        parentId: input.parentId,
        description: input.description,
      });
      return Object.freeze({
        id: category.id,
        tenantId: category.companyId,
        parentId: category.parentId,
        name: category.name,
        slug: category.slug,
        description: category.description,
        sortOrder: category.sortOrder,
        isActive: category.isActive,
      });
    },
    async upsertRegionalPrice(input) {
      assertTenant(input.tenantId);
      const { price } = await platform.commands.upsertRegionalPrice(buildContext(ctx, input.tenantId), {
        companyId: input.tenantId,
        productId: input.productId,
        id: input.id,
        country: input.country,
        market: input.market,
        region: input.region,
        localPrice: input.localPrice,
        currencyOverride: input.currencyOverride,
      });
      return Object.freeze({
        id: price.id,
        productId: price.productId,
        country: price.country,
        market: price.market,
        region: price.region,
        localPrice: price.localPrice,
        currencyOverride: price.currencyOverride,
        isActive: price.isActive,
      });
    },
    async attachToOpportunity(input) {
      assertTenant(input.tenantId);
      const { line } = await platform.commands.attachProductToOpportunity(
        buildContext(ctx, input.tenantId),
        {
          companyId: input.tenantId,
          opportunityId: input.opportunityId,
          productId: input.productId,
          quantity: input.quantity,
          discountPercent: input.discountPercent,
          taxPercent: input.taxPercent,
          country: input.country,
          market: input.market,
          unitPriceOverride: input.unitPriceOverride,
        },
      );
      return Object.freeze({
        id: line.id,
        opportunityId: line.opportunityId,
        productId: line.productId,
        productName: line.productNameSnapshot,
        sku: line.skuSnapshot,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountPercent: line.discountPercent,
        taxPercent: line.taxPercent,
        currency: line.currency,
        subtotal: line.subtotal,
        taxAmount: line.taxAmount,
        total: line.total,
      });
    },
    async updateOpportunityLine(input) {
      assertTenant(input.tenantId);
      const { line } = await platform.commands.updateOpportunityLine(buildContext(ctx, input.tenantId), {
        companyId: input.tenantId,
        opportunityId: input.opportunityId,
        lineId: input.lineId,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        discountPercent: input.discountPercent,
        taxPercent: input.taxPercent,
      });
      return Object.freeze({
        id: line.id,
        opportunityId: line.opportunityId,
        productId: line.productId,
        productName: line.productNameSnapshot,
        sku: line.skuSnapshot,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountPercent: line.discountPercent,
        taxPercent: line.taxPercent,
        currency: line.currency,
        subtotal: line.subtotal,
        taxAmount: line.taxAmount,
        total: line.total,
      });
    },
    async removeOpportunityLine(tenantId, lineId) {
      assertTenant(tenantId);
      await platform.commands.removeOpportunityLine(buildContext(ctx, tenantId), {
        companyId: tenantId,
        lineId,
      });
    },
  };
}
