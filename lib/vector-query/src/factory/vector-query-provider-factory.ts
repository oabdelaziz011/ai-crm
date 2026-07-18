import type { SupabaseClient } from "@supabase/supabase-js";
import {
  UnsupportedVectorQueryProviderError,
  VectorQueryConfigurationError,
  VectorQueryProviderNotFoundError,
} from "../errors.js";
import type { VectorStoreDefinitionReader } from "../repositories/vector-query-repositories.js";
import type { ResolveVectorQueryProviderInput } from "../types.js";
import { mergeConfiguration, validateAgainstSchema } from "../utils/validate-configuration.js";
import {
  createVectorQueryProviderAdapterRegistry,
  type VectorQueryProvider,
  type VectorQueryProviderAdapterRegistry,
} from "../contracts/vector-query-provider.js";
import { createVectorQueryAdapters } from "../providers/stub-adapters.js";

export class VectorQueryProviderFactory {
  constructor(
    private readonly definitionReader: VectorStoreDefinitionReader,
    private readonly adapterRegistry: VectorQueryProviderAdapterRegistry = createVectorQueryProviderAdapterRegistry(
      createVectorQueryAdapters(),
    ),
  ) {}

  static withClient(
    definitionReader: VectorStoreDefinitionReader,
    client: SupabaseClient,
  ): VectorQueryProviderFactory {
    return new VectorQueryProviderFactory(
      definitionReader,
      createVectorQueryProviderAdapterRegistry(createVectorQueryAdapters({ client })),
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
    const definition = await this.definitionReader.findByKey(providerKey);
    if (!definition) {
      return { valid: false, errors: [`Provider ${providerKey} not found.`] };
    }

    const merged = mergeConfiguration(definition.default_configuration, configuration);
    return validateAgainstSchema(definition.configuration_schema, merged);
  }

  async resolve(input: ResolveVectorQueryProviderInput): Promise<VectorQueryProvider> {
    const definition = await this.definitionReader.findByKey(input.providerKey);
    if (!definition) {
      throw new VectorQueryProviderNotFoundError(input.providerKey);
    }
    if (!definition.is_active) {
      throw new VectorQueryProviderNotFoundError(input.providerKey);
    }
    if (!this.adapterRegistry.has(input.providerKey)) {
      throw new UnsupportedVectorQueryProviderError(input.providerKey);
    }

    const mergedConfiguration = mergeConfiguration(definition.default_configuration, input.configuration);
    const validation = validateAgainstSchema(definition.configuration_schema, mergedConfiguration);
    if (!validation.valid) {
      throw new VectorQueryConfigurationError(validation.errors.join("; "));
    }

    return this.adapterRegistry.create(input.providerKey, mergedConfiguration);
  }
}

export function createDefaultVectorQueryProviderFactory(
  definitionReader: VectorStoreDefinitionReader,
  client?: SupabaseClient,
): VectorQueryProviderFactory {
  if (client) {
    return VectorQueryProviderFactory.withClient(definitionReader, client);
  }
  return new VectorQueryProviderFactory(definitionReader);
}
