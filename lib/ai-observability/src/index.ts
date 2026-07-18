import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabaseExecutionAnalyticsRepository,
  createSupabaseTokenCostRepository,
  createSupabaseTraceRepository,
  createSupabaseTraceSpanRepository,
} from "./repositories/supabase-observability-repositories.js";
import { CostAccountingService } from "./services/cost-accounting-service.js";
import { ErrorCatalogService } from "./services/error-catalog-service.js";
import { ExecutionAnalyticsService } from "./services/execution-analytics-service.js";
import { TraceService } from "./services/trace-service.js";

export type AIObservabilityServices = {
  trace: TraceService;
  analytics: ExecutionAnalyticsService;
  costs: CostAccountingService;
  errors: ErrorCatalogService;
};

export function createAIObservabilityServices(client: SupabaseClient): AIObservabilityServices {
  const traceRepository = createSupabaseTraceRepository(client);
  const spanRepository = createSupabaseTraceSpanRepository(client);
  const analyticsRepository = createSupabaseExecutionAnalyticsRepository(client);
  const costRepository = createSupabaseTokenCostRepository(client);
  const errorCatalogService = new ErrorCatalogService();
  const costAccountingService = new CostAccountingService(costRepository);

  return {
    errors: errorCatalogService,
    costs: costAccountingService,
    analytics: new ExecutionAnalyticsService(analyticsRepository, costAccountingService),
    trace: new TraceService(traceRepository, spanRepository, errorCatalogService),
  };
}

export * from "./constants.js";
export * from "./errors.js";
export * from "./types.js";
export * from "./utils/trace-utils.js";
export * from "./utils/cost-utils.js";
export * from "./utils/error-utils.js";
export * from "./repositories/observability-repositories.js";
export * from "./repositories/supabase-observability-repositories.js";
export * from "./services/trace-service.js";
export * from "./services/execution-analytics-service.js";
export * from "./services/cost-accounting-service.js";
export * from "./services/error-catalog-service.js";
