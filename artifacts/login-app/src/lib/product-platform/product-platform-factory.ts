import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createProductPlatformServices,
  createNoopProductEventPublisher,
  type ProductEventPublisherPort,
  type ProductPlatformServices,
  type CatalogProductRecord,
} from "@workspace/product-platform";
import { createSupabaseOpportunityRepository } from "@workspace/opportunity-platform";
import { createModulePublisher } from "@workspace/platform-events";
import type { CatalogProductReadModel } from "@workspace/application-layer";
import { getLoginAppPlatformEventBus } from "@/lib/application-layer/platform-event-bus-factory.js";

export function createProductEventBridge(): ProductEventPublisherPort {
  const bus = () => createModulePublisher(getLoginAppPlatformEventBus(), "products");

  return {
    async publishCreated(input) {
      await bus().publish(
        "ProductCreated",
        {
          productId: input.productId,
          name: input.name,
          sku: input.sku,
          productType: input.productType,
          companyId: input.companyId,
        },
        {
          tenantId: input.companyId,
          correlationId: `${input.productId}:created`,
          actorId: input.actorUserId ?? undefined,
          actorType: "user",
          sourceModule: "products",
          entityType: "product",
          entityId: input.productId,
        },
      );
    },
    async publishUpdated(input) {
      await bus().publish(
        "ProductUpdated",
        {
          productId: input.productId,
          changedFields: input.changedFields,
          companyId: input.companyId,
        },
        {
          tenantId: input.companyId,
          correlationId: `${input.productId}:updated`,
          actorId: input.actorUserId ?? undefined,
          actorType: "user",
          sourceModule: "products",
          entityType: "product",
          entityId: input.productId,
        },
      );
    },
    async publishArchived(input) {
      await bus().publish(
        "ProductArchived",
        { productId: input.productId, companyId: input.companyId },
        {
          tenantId: input.companyId,
          correlationId: `${input.productId}:archived`,
          actorId: input.actorUserId ?? undefined,
          actorType: "user",
          sourceModule: "products",
          entityType: "product",
          entityId: input.productId,
        },
      );
    },
    async publishPriceChanged(input) {
      await bus().publish(
        "PriceChanged",
        {
          productId: input.productId,
          previousPrice: input.previousPrice,
          nextPrice: input.nextPrice,
          currency: input.currency,
          companyId: input.companyId,
        },
        {
          tenantId: input.companyId,
          correlationId: `${input.productId}:price`,
          actorId: input.actorUserId ?? undefined,
          actorType: "user",
          sourceModule: "products",
          entityType: "product",
          entityId: input.productId,
        },
      );
    },
    async publishCategoryChanged(input) {
      await bus().publish(
        "CategoryChanged",
        {
          productId: input.productId,
          previousCategoryId: input.previousCategoryId,
          nextCategoryId: input.nextCategoryId,
          companyId: input.companyId,
        },
        {
          tenantId: input.companyId,
          correlationId: `${input.productId}:category`,
          actorId: input.actorUserId ?? undefined,
          actorType: "user",
          sourceModule: "products",
          entityType: "product",
          entityId: input.productId,
        },
      );
    },
    async publishOpportunityProductsAdded(input) {
      await bus().publish(
        "OpportunityProductsAdded",
        {
          opportunityId: input.opportunityId,
          productIds: input.productIds,
          companyId: input.companyId,
        },
        {
          tenantId: input.companyId,
          correlationId: `${input.opportunityId}:products`,
          actorId: input.actorUserId ?? undefined,
          actorType: "user",
          sourceModule: "opportunities",
          entityType: "opportunity",
          entityId: input.opportunityId,
        },
      );
    },
  };
}

export function createLoginAppProductPlatformServices(client: SupabaseClient): ProductPlatformServices {
  const opportunities = createSupabaseOpportunityRepository(client);
  return createProductPlatformServices(client, {
    events: createProductEventBridge(),
    opportunityHistory: {
      addHistory: async (input) => {
        await opportunities.addHistory(input);
      },
    },
  });
}

export function createLoginAppProductPlatformServicesSilent(
  client: SupabaseClient,
): ProductPlatformServices {
  return createProductPlatformServices(client, { events: createNoopProductEventPublisher() });
}

export function mapCatalogProduct(record: CatalogProductRecord): CatalogProductReadModel {
  return Object.freeze({
    id: record.id,
    tenantId: record.companyId,
    categoryId: record.categoryId,
    productType: record.productType,
    name: record.name,
    sku: record.sku,
    brand: record.brand,
    description: record.description,
    basePrice: record.basePrice,
    currency: record.currency,
    taxClass: record.taxClass,
    cost: record.cost,
    marginPercent: record.marginPercent,
    isActive: record.isActive,
    subscriptionInterval: record.subscriptionInterval,
    subscriptionPrice: record.subscriptionPrice,
    trackInventory: record.trackInventory,
    stockQuantity: record.stockQuantity,
    unit: record.unit,
    tags: Object.freeze([...record.tags]),
    imageUrls: Object.freeze([...record.imageUrls]),
    documentUrls: Object.freeze([...record.documentUrls]),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}
