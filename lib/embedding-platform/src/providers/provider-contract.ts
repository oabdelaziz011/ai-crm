import type {
  ConfigurationValidationResult,
  GenerateEmbeddingInput,
  GenerateEmbeddingResult,
  GenerateEmbeddingsBatchInput,
  GenerateEmbeddingsBatchResult,
  HealthResult,
  ModelsResult,
} from "../types.js";

export interface EmbeddingProvider {
  readonly key: string;
  generateEmbedding(input: GenerateEmbeddingInput): Promise<GenerateEmbeddingResult>;
  generateEmbeddingsBatch?(input: GenerateEmbeddingsBatchInput): Promise<GenerateEmbeddingsBatchResult>;
  health(): Promise<HealthResult>;
  models(): Promise<ModelsResult>;
  validateConfiguration(configuration: Record<string, unknown>): ConfigurationValidationResult;
}

export type EmbeddingProviderAdapterFactory = (configuration: Record<string, unknown>) => EmbeddingProvider;

export type EmbeddingProviderAdapterRegistry = {
  has(key: string): boolean;
  keys(): string[];
  create(key: string, configuration: Record<string, unknown>): EmbeddingProvider;
};

export function createEmbeddingProviderAdapterRegistry(
  adapters: Record<string, EmbeddingProviderAdapterFactory>,
): EmbeddingProviderAdapterRegistry {
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
