import {
  AIProviderConfigurationError,
  AIProviderDisabledError,
  AIProviderNotFoundError,
  UnsupportedAIProviderError,
} from "../errors.js";
import type { AIProviderDefinitionRepository } from "../repositories/provider-repositories.js";
import type { ResolveProviderInput } from "../types.js";
import { mergeConfiguration, validateAgainstSchema } from "../utils/validate-configuration.js";
import {
  createAIProviderAdapterRegistry,
  type AIProvider,
  type AIProviderAdapterRegistry,
} from "../providers/provider-contract.js";
import { createOpenAIChatAdapter } from "../providers/openai-chat-adapter.js";
import { createStubAdapters } from "../providers/stub-adapters.js";

export class AIProviderFactory {
  constructor(
    private readonly definitionRepository: AIProviderDefinitionRepository,
    private readonly adapterRegistry: AIProviderAdapterRegistry = createAIProviderAdapterRegistry(
      createStubAdapters(),
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

  async resolve(input: ResolveProviderInput): Promise<AIProvider> {
    const definition = await this.definitionRepository.findByKey(input.providerKey);
    if (!definition) {
      throw new AIProviderNotFoundError(input.providerKey);
    }
    if (!definition.is_active) {
      throw new AIProviderDisabledError(input.providerKey);
    }
    if (!this.adapterRegistry.has(input.providerKey)) {
      throw new UnsupportedAIProviderError(input.providerKey);
    }

    const mergedConfiguration = mergeConfiguration(definition.default_configuration, input.configuration);
    const validation = validateAgainstSchema(definition.configuration_schema, mergedConfiguration);
    if (!validation.valid) {
      throw new AIProviderConfigurationError(validation.errors.join("; "));
    }

    return this.adapterRegistry.create(input.providerKey, mergedConfiguration);
  }
}

export function createDefaultAIProviderFactory(
  definitionRepository: AIProviderDefinitionRepository,
): AIProviderFactory {
  const stubAdapters = createStubAdapters();
  return new AIProviderFactory(
    definitionRepository,
    createAIProviderAdapterRegistry({
      ...stubAdapters,
      openai: (configuration) => createOpenAIChatAdapter(configuration),
    }),
  );
}
