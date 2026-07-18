import type {
  ConfigurationValidationResult,
  HealthResult,
  ProviderQueryInput,
  ProviderQueryResult,
  QueryStatisticsInput,
  QueryStatisticsResult,
} from "../types.js";
import type { QueryProviderCapability } from "../constants.js";

export interface VectorQueryProvider {
  readonly key: string;
  health(): Promise<HealthResult>;
  validateConfiguration(configuration: Record<string, unknown>): ConfigurationValidationResult;
  query(input: ProviderQueryInput): Promise<ProviderQueryResult>;
  supportedCapabilities(): QueryProviderCapability[];
  statistics(input: QueryStatisticsInput): Promise<QueryStatisticsResult>;
}

export type VectorQueryProviderAdapterFactory = (configuration: Record<string, unknown>) => VectorQueryProvider;

export type VectorQueryProviderAdapterRegistry = {
  has(key: string): boolean;
  keys(): string[];
  create(key: string, configuration: Record<string, unknown>): VectorQueryProvider;
};

export function createVectorQueryProviderAdapterRegistry(
  adapters: Record<string, VectorQueryProviderAdapterFactory>,
): VectorQueryProviderAdapterRegistry {
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
        throw new Error(`Query adapter factory for ${key} is not registered.`);
      }
      return factory(configuration);
    },
  };
}
