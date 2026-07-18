import type { SupabaseClient } from "@supabase/supabase-js";
import { createDefaultVectorQueryProviderFactory } from "./factory/vector-query-provider-factory.js";
import { NoopVectorQueryTelemetryPort, type VectorQueryTelemetryPort } from "./ports/observability-port.js";
import {
  createSupabaseIndexedVectorReadRepository,
  createSupabaseQueryExecutionRepository,
  createSupabaseQueryResultRepository,
  createSupabaseSearchPolicyRepository,
  createSupabaseVectorStoreConnectionReader,
  createSupabaseVectorStoreDefinitionReader,
} from "./repositories/supabase-vector-query-repositories.js";
import { VectorQueryExecutionService } from "./services/vector-query-execution-service.js";
import { VectorQueryManagementService } from "./services/vector-query-management-service.js";
import { VectorQueryPolicyService } from "./services/vector-query-policy-service.js";
import { VectorQueryProviderRegistryService } from "./services/vector-query-provider-registry-service.js";
import { VectorRankingService } from "./services/vector-ranking-service.js";
import { VectorResultNormalizationService } from "./services/vector-result-normalization-service.js";

export type VectorQueryServicesOptions = {
  telemetry?: VectorQueryTelemetryPort;
};

export type VectorQueryServices = {
  policies: VectorQueryPolicyService;
  execution: VectorQueryExecutionService;
  ranking: VectorRankingService;
  normalization: VectorResultNormalizationService;
  management: VectorQueryManagementService;
  providerRegistry: VectorQueryProviderRegistryService;
  factory: ReturnType<typeof createDefaultVectorQueryProviderFactory>;
};

export function createVectorQueryServices(
  client: SupabaseClient,
  options?: VectorQueryServicesOptions,
): VectorQueryServices {
  const definitionReader = createSupabaseVectorStoreDefinitionReader(client);
  const policyRepository = createSupabaseSearchPolicyRepository(client);
  const executionRepository = createSupabaseQueryExecutionRepository(client);
  const resultRepository = createSupabaseQueryResultRepository(client);
  const connectionReader = createSupabaseVectorStoreConnectionReader(client);
  const readRepository = createSupabaseIndexedVectorReadRepository(client);
  const factory = createDefaultVectorQueryProviderFactory(definitionReader, client);
  const providerRegistry = new VectorQueryProviderRegistryService(
    definitionReader,
    connectionReader,
    factory,
  );
  const telemetry = options?.telemetry ?? new NoopVectorQueryTelemetryPort();

  const policies = new VectorQueryPolicyService(policyRepository);
  const normalization = new VectorResultNormalizationService(readRepository);
  const ranking = new VectorRankingService();
  const execution = new VectorQueryExecutionService(
    executionRepository,
    resultRepository,
    connectionReader,
    readRepository,
    providerRegistry,
    policies,
    normalization,
    ranking,
  );
  const management = new VectorQueryManagementService(
    execution,
    policies,
    executionRepository,
    resultRepository,
    telemetry,
  );

  return {
    policies,
    execution,
    ranking,
    normalization,
    management,
    providerRegistry,
    factory,
  };
}

export * from "./constants.js";
export * from "./dto/vector-query-dto.js";
export * from "./errors.js";
export * from "./types.js";
export * from "./utils/query-utils.js";
export * from "./utils/query-logger.js";
export * from "./utils/validate-configuration.js";
export * from "./contracts/vector-query-provider.js";
export * from "./providers/stub-adapters.js";
export * from "./providers/pgvector/pgvector-query-adapter.js";
export * from "./factory/vector-query-provider-factory.js";
export * from "./ports/observability-port.js";
export * from "./repositories/vector-query-repositories.js";
export * from "./repositories/supabase-vector-query-repositories.js";
export * from "./services/vector-query-policy-service.js";
export * from "./services/vector-query-execution-service.js";
export * from "./services/vector-result-normalization-service.js";
export * from "./services/vector-ranking-service.js";
export * from "./services/vector-query-management-service.js";
export * from "./services/vector-query-provider-registry-service.js";
