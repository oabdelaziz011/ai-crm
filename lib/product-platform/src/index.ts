import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseProductRepository } from "./repositories/supabase-product-repositories.js";
import {
  ProductCommandService,
  type ProductEventPublisherPort,
  type OpportunityHistoryRecorderPort,
} from "./services/product-command-service.js";
import { ProductQueryService } from "./services/product-query-service.js";

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
  } = {},
): ProductPlatformServices {
  const products = createSupabaseProductRepository(client);
  const events = options.events ?? createNoopProductEventPublisher();
  return {
    commands: new ProductCommandService({ products, events, opportunityHistory: options.opportunityHistory }),
    queries: new ProductQueryService({ products }),
  };
}

export * from "./constants.js";
export * from "./errors.js";
export * from "./types.js";
export type { ProductRepository } from "./repositories/product-repository-port.js";
export { createSupabaseProductRepository } from "./repositories/supabase-product-repositories.js";
export { ProductCommandService } from "./services/product-command-service.js";
export { ProductQueryService } from "./services/product-query-service.js";
export type { ProductEventPublisherPort, OpportunityHistoryRecorderPort } from "./services/product-command-service.js";
