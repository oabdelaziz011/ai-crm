import type {
  CollectionStatisticsInput,
  CollectionStatisticsResult,
  ConfigurationValidationResult,
  CreateCollectionInput,
  CreateCollectionResult,
  DeleteCollectionInput,
  DeleteCollectionResult,
  DeleteVectorInput,
  DeleteVectorResult,
  HealthResult,
  UpsertVectorInput,
  UpsertVectorResult,
} from "../types.js";
import { buildExternalReference } from "../utils/vector-store-utils.js";

export interface VectorStoreProvider {
  readonly key: string;
  health(): Promise<HealthResult>;
  validateConfiguration(configuration: Record<string, unknown>): ConfigurationValidationResult;
  createCollection(input: CreateCollectionInput): Promise<CreateCollectionResult>;
  deleteCollection(input: DeleteCollectionInput): Promise<DeleteCollectionResult>;
  upsertVector(input: UpsertVectorInput): Promise<UpsertVectorResult>;
  deleteVector(input: DeleteVectorInput): Promise<DeleteVectorResult>;
  collectionStatistics(input: CollectionStatisticsInput): Promise<CollectionStatisticsResult>;
}

export type VectorStoreProviderAdapterFactory = (configuration: Record<string, unknown>) => VectorStoreProvider;

export type VectorStoreProviderAdapterRegistry = {
  has(key: string): boolean;
  keys(): string[];
  create(key: string, configuration: Record<string, unknown>): VectorStoreProvider;
};

export function createVectorStoreProviderAdapterRegistry(
  adapters: Record<string, VectorStoreProviderAdapterFactory>,
): VectorStoreProviderAdapterRegistry {
  const registry = new Map(Object.entries(adapters));

  return {
    has(key: string) {
      return registry.has(key);
    },
    keys() {
      return [...registry.keys()];
    },
    create(key: string, configuration: Record<string, unknown>) {
      const factory = registry.get(key);
      if (!factory) {
        throw new Error(`Adapter factory for ${key} is not registered.`);
      }
      return factory(configuration);
    },
  };
}

export function createStubVectorStoreProvider(options: {
  key: string;
  displayName: string;
  validateConfiguration: (configuration: Record<string, unknown>) => ConfigurationValidationResult;
}): VectorStoreProviderAdapterFactory {
  return (configuration) => ({
    key: options.key,
    validateConfiguration: options.validateConfiguration,
    async health() {
      const validation = options.validateConfiguration(configuration);
      return {
        status: validation.valid ? "connected" : "warning",
        providerKey: options.key,
        message: validation.valid
          ? `${options.displayName} stub adapter is configured.`
          : validation.errors.join("; "),
        checkedAt: new Date().toISOString(),
        mock: true as const,
      };
    },
    async createCollection(input) {
      return {
        collectionName: input.name,
        providerKey: options.key,
        mock: true as const,
      };
    },
    async deleteCollection(input) {
      return {
        collectionName: input.name,
        deleted: true as const,
        mock: true as const,
      };
    },
    async upsertVector(input) {
      return {
        collectionName: input.collectionName,
        vectorId: input.vectorId,
        externalReference: buildExternalReference(options.key, input.collectionName, input.vectorId),
        mock: true as const,
      };
    },
    async deleteVector(input) {
      return {
        collectionName: input.collectionName,
        vectorId: input.vectorId,
        deleted: true as const,
        mock: true as const,
      };
    },
    async collectionStatistics(input) {
      return {
        collectionName: input.collectionName,
        vectorCount: 0,
        dimensions: 0,
        providerKey: options.key,
        mock: true as const,
      };
    },
  });
}
