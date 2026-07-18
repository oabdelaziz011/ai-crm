import type {
  ClassifyInput,
  ClassifyResult,
  ConfigurationValidationResult,
  EmbedInput,
  EmbedResult,
  GenerateInput,
  GenerateResult,
  HealthResult,
  ModelsResult,
} from "../types.js";

export interface AIProvider {
  readonly key: string;
  generate(input: GenerateInput): Promise<GenerateResult>;
  classify(input: ClassifyInput): Promise<ClassifyResult>;
  embed(input: EmbedInput): Promise<EmbedResult>;
  health(): Promise<HealthResult>;
  models(): Promise<ModelsResult>;
  validateConfiguration(configuration: Record<string, unknown>): ConfigurationValidationResult;
}

export type AIProviderAdapterFactory = (configuration: Record<string, unknown>) => AIProvider;

export type AIProviderAdapterRegistry = {
  has(key: string): boolean;
  keys(): string[];
  create(key: string, configuration: Record<string, unknown>): AIProvider;
};

export function createAIProviderAdapterRegistry(
  adapters: Record<string, AIProviderAdapterFactory>,
): AIProviderAdapterRegistry {
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
