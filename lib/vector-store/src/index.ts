import type { SupabaseClient } from "@supabase/supabase-js";
import { createDefaultVectorStoreProviderFactory } from "./factory/vector-store-provider-factory.js";
import {
  createSupabaseIndexedVectorRepository,
  createSupabaseKnowledgeEmbeddingReader,
  createSupabaseVectorCollectionRepository,
  createSupabaseVectorStoreConnectionRepository,
  createSupabaseVectorStoreDefinitionRepository,
} from "./repositories/supabase-vector-store-repositories.js";
import { VectorCollectionService } from "./services/vector-collection-service.js";
import { VectorIndexService } from "./services/vector-index-service.js";
import { VectorStoreManagementService } from "./services/vector-store-management-service.js";
import { VectorStoreProviderRegistryService } from "./services/vector-store-provider-registry-service.js";

export type VectorStoreServices = {
  registry: VectorStoreProviderRegistryService;
  factory: ReturnType<typeof createDefaultVectorStoreProviderFactory>;
  collections: VectorCollectionService;
  index: VectorIndexService;
  management: VectorStoreManagementService;
};

export function createVectorStoreServices(client: SupabaseClient): VectorStoreServices {
  const definitionRepository = createSupabaseVectorStoreDefinitionRepository(client);
  const connectionRepository = createSupabaseVectorStoreConnectionRepository(client);
  const collectionRepository = createSupabaseVectorCollectionRepository(client);
  const indexedVectorRepository = createSupabaseIndexedVectorRepository(client);
  const embeddingReader = createSupabaseKnowledgeEmbeddingReader(client);
  const factory = createDefaultVectorStoreProviderFactory(definitionRepository, client);

  const registry = new VectorStoreProviderRegistryService(definitionRepository, connectionRepository, factory);
  const collections = new VectorCollectionService(collectionRepository, connectionRepository, factory);
  const index = new VectorIndexService(
    indexedVectorRepository,
    collectionRepository,
    connectionRepository,
    embeddingReader,
    factory,
  );
  const management = new VectorStoreManagementService(registry, collections, index);

  return {
    registry,
    factory,
    collections,
    index,
    management,
  };
}

export * from "./constants.js";
export * from "./errors.js";
export * from "./types.js";
export * from "./utils/validate-configuration.js";
export * from "./utils/vector-store-utils.js";
export * from "./providers/provider-contract.js";
export * from "./providers/stub-adapters.js";
export * from "./providers/pgvector/pgvector-storage.js";
export * from "./providers/pgvector/pgvector-store-adapter.js";
export * from "./utils/enrich-provider-configuration.js";
export * from "./factory/vector-store-provider-factory.js";
export * from "./repositories/vector-store-repositories.js";
export * from "./repositories/supabase-vector-store-repositories.js";
export * from "./services/vector-store-provider-registry-service.js";
export * from "./services/vector-collection-service.js";
export * from "./services/vector-index-service.js";
export * from "./services/vector-store-management-service.js";
