import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseProductRepository } from "./repositories/supabase-product-repositories.js";
import {
  ProductCommandService,
  type ProductEventPublisherPort,
  type OpportunityHistoryRecorderPort,
} from "./services/product-command-service.js";
import { ProductQueryService } from "./services/product-query-service.js";
import type { ProductAliasGenerationSchedulerPort } from "./services/product-alias-generation-service.js";

export type ProductPlatformServices = {
  commands: ProductCommandService;
  queries: ProductQueryService;
};

export function createNoopProductEventPublisher(): ProductEventPublisherPort {
  return {
    async publishCreated() {},
    async publishUpdated() {},
    async publishArchived() {},
    async publishPriceChanged() {},
    async publishCategoryChanged() {},
    async publishOpportunityProductsAdded() {},
  };
}

export function createProductPlatformServices(
  client: SupabaseClient,
  options: {
    events?: ProductEventPublisherPort;
    opportunityHistory?: OpportunityHistoryRecorderPort;
    aliasGeneration?: ProductAliasGenerationSchedulerPort;
    isAliasGenerationEnabled?: () => boolean;
  } = {},
): ProductPlatformServices {
  const products = createSupabaseProductRepository(client);
  const events = options.events ?? createNoopProductEventPublisher();
  return {
    commands: new ProductCommandService({
      products,
      events,
      opportunityHistory: options.opportunityHistory,
      aliasGeneration: options.aliasGeneration,
      isAliasGenerationEnabled: options.isAliasGenerationEnabled,
    }),
    queries: new ProductQueryService({ products }),
  };
}

export * from "./constants.js";
export * from "./errors.js";
export * from "./product-tax.js";
export * from "./product-aliases.js";
export * from "./product-alias-generation-flag.js";
export * from "./product-alias-language.js";
export * from "./product-alias-generation.js";
export * from "./types.js";
export type { ProductRepository } from "./repositories/product-repository-port.js";
export { createSupabaseProductRepository } from "./repositories/supabase-product-repositories.js";
export { ProductCommandService } from "./services/product-command-service.js";
export { ProductQueryService } from "./services/product-query-service.js";
export type { ProductEventPublisherPort, OpportunityHistoryRecorderPort } from "./services/product-command-service.js";
export {
  executeProductAliasGeneration,
  type ProductAliasGenerationSchedulerPort,
  type ProductAliasGenerationRunResult,
} from "./services/product-alias-generation-service.js";
