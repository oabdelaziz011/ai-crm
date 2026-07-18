import {
  EmbeddingProviderConfigurationError,
  EmbeddingProviderDisabledError,
  EmbeddingProviderNotFoundError,
  UnsupportedEmbeddingProviderError,
} from "../errors.js";
import type { EmbeddingProviderDefinitionRepository } from "../repositories/embedding-repositories.js";
import type { ResolveEmbeddingProviderInput } from "../types.js";
import { mergeConfiguration, validateAgainstSchema } from "../utils/validate-configuration.js";
import {
  createEmbeddingProviderAdapterRegistry,
  type EmbeddingProvider,
  type EmbeddingProviderAdapterRegistry,
} from "../providers/provider-contract.js";
import { createEmbeddingAdapters } from "../providers/stub-adapters.js";

export class EmbeddingProviderFactory {
  constructor(
    private readonly definitionRepository: EmbeddingProviderDefinitionRepository,
    private readonly adapterRegistry: EmbeddingProviderAdapterRegistry = createEmbeddingProviderAdapterRegistry(
      createEmbeddingAdapters(),
    ),
  ) {}

  getSupportedProviderKeys(): string[] {
    return this.adapterRegistry.keys();
  }

  isAdapterSupported(providerKey: string): boolean {
    return this.adapterRegistry.has(providerKey);
  }

  async validateConfiguration(
    providerKey: string,
    configuration: Record<string, unknown>,
  ): Promise<{ valid: boolean; errors: string[] }> {
    const definition = await this.definitionRepository.findByKey(providerKey);
    if (!definition) {
      return { valid: false, errors: [`Provider ${providerKey} not found.`] };
    }

    const merged = mergeConfiguration(definition.default_configuration, configuration);
    return validateAgainstSchema(definition.configuration_schema, merged);
  }

  async resolve(input: ResolveEmbeddingProviderInput): Promise<EmbeddingProvider> {
    const definition = await this.definitionRepository.findByKey(input.providerKey);
    if (!definition) {
      throw new EmbeddingProviderNotFoundError(input.providerKey);
    }
    if (!definition.is_active) {
      throw new EmbeddingProviderDisabledError(input.providerKey);
    }
    if (!this.adapterRegistry.has(input.providerKey)) {
      throw new UnsupportedEmbeddingProviderError(input.providerKey);
    }

    const mergedConfiguration = mergeConfiguration(definition.default_configuration, input.configuration);
    const validation = validateAgainstSchema(definition.configuration_schema, mergedConfiguration);
    if (!validation.valid) {
      throw new EmbeddingProviderConfigurationError(validation.errors.join("; "));
    }

    return this.adapterRegistry.create(input.providerKey, mergedConfiguration);
  }
}

export function createDefaultEmbeddingProviderFactory(
  definitionRepository: EmbeddingProviderDefinitionRepository,
): EmbeddingProviderFactory {
  return new EmbeddingProviderFactory(definitionRepository);
}
