import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseProductDemoRepository } from "./repositories/supabase-product-demo-repository.js";
import { ProductDemoCommandService } from "./services/product-demo-command-service.js";
import { ProductDemoQueryService } from "./services/product-demo-query-service.js";

export type ProductDemoSchedulingServices = {
  commands: ProductDemoCommandService;
  queries: ProductDemoQueryService;
};

export function createProductDemoSchedulingServices(
  client: SupabaseClient,
): ProductDemoSchedulingServices {
  const demos = createSupabaseProductDemoRepository(client);
  return {
    commands: new ProductDemoCommandService({ demos }),
    queries: new ProductDemoQueryService({ demos }),
  };
}

export { PRODUCT_DEMO_PERMISSIONS } from "./constants.js";
export type {
  ProductDemoOfferingStatus,
  ProductDemoSlotStatus,
  ProductDemoBookingStatus,
} from "./constants.js";
export {
  ProductDemoError,
  ProductDemoPermissionError,
  ProductDemoValidationError,
  ProductDemoConflictError,
} from "./errors.js";
export type {
  ProductDemoServiceContext,
  ProductDemoOffering,
  ProductDemoPresenter,
  ProductDemoSlot,
  ProductDemoBooking,
  BookableDemoSlot,
} from "./types.js";
export { ProductDemoCommandService } from "./services/product-demo-command-service.js";
export { ProductDemoQueryService } from "./services/product-demo-query-service.js";
export {
  generateSlotCandidates,
  isSlotBookableNow,
  sortBookableNearestFirst,
} from "./services/slot-generation.js";
export { createSupabaseProductDemoRepository } from "./repositories/supabase-product-demo-repository.js";
export type { ProductDemoRepository } from "./repositories/product-demo-repository-port.js";
