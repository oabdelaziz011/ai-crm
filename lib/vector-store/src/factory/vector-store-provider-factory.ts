import type { SupabaseClient } from "@supabase/supabase-js";
import {
  UnsupportedVectorStoreProviderError,
  VectorStoreConfigurationError,
  VectorStoreProviderDisabledError,
  VectorStoreProviderNotFoundError,
} from "../errors.js";
import type { VectorStoreDefinitionRepository } from "../repositories/vector-store-repositories.js";
import type { ResolveVectorStoreProviderInput } from "../types.js";
import { mergeConfiguration, validateAgainstSchema } from "../utils/validate-configuration.js";
import {
  createVectorStoreProviderAdapterRegistry,
  type VectorStoreProvider,
  type VectorStoreProviderAdapterRegistry,
} from "../providers/provider-contract.js";
import { createVectorStoreAdapters } from "../providers/stub-adapters.js";

export class VectorStoreProviderFactory {
  constructor(
    private readonly definitionRepository: VectorStoreDefinitionRepository,
    private readonly adapterRegistry: VectorStoreProviderAdapterRegistry = createVectorStoreProviderAdapterRegistry(
      createVectorStoreAdapters(),
    ),
  ) {}

  static withClient(
    definitionRepository: VectorStoreDefinitionRepository,
    client: SupabaseClient,
  ): VectorStoreProviderFactory {
    return new VectorStoreProviderFactory(
      definitionRepository,
      createVectorStoreProviderAdapterRegistry(createVectorStoreAdapters({ client })),
    );
  }

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

  async resolve(input: ResolveVectorStoreProviderInput): Promise<VectorStoreProvider> {
    const definition = await this.definitionRepository.findByKey(input.providerKey);
    if (!definition) {
      throw new VectorStoreProviderNotFoundError(input.providerKey);
    }
    if (!definition.is_active) {
      throw new VectorStoreProviderDisabledError(input.providerKey);
    }
    if (!this.adapterRegistry.has(input.providerKey)) {
      throw new UnsupportedVectorStoreProviderError(input.providerKey);
    }

    const mergedConfiguration = mergeConfiguration(definition.default_configuration, input.configuration);
    const validation = validateAgainstSchema(definition.configuration_schema, mergedConfiguration);
    if (!validation.valid) {
      throw new VectorStoreConfigurationError(validation.errors.join("; "));
    }

    return this.adapterRegistry.create(input.providerKey, mergedConfiguration);
  }
}

export function createDefaultVectorStoreProviderFactory(
  definitionRepository: VectorStoreDefinitionRepository,
  client?: SupabaseClient,
): VectorStoreProviderFactory {
  if (client) {
    return VectorStoreProviderFactory.withClient(definitionRepository, client);
  }
  return new VectorStoreProviderFactory(definitionRepository);
}
