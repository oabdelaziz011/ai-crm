import { enrichProviderConfiguration } from "@workspace/vector-store";
import { VECTOR_QUERY_PERMISSIONS } from "../constants.js";
import { PermissionDeniedError } from "../errors/error-catalog.js";
import type { VectorQueryProviderFactory } from "../factory/vector-query-provider-factory.js";
import type { VectorStoreConnectionReader, VectorStoreDefinitionReader } from "../repositories/vector-query-repositories.js";
import type { ServiceContext, VectorStoreConnectionSnapshot } from "../types.js";
import type { VectorQueryProvider } from "../contracts/vector-query-provider.js";

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) {
    throw new PermissionDeniedError(permission);
  }
}

/**
 * Resolves provider instances through the factory.
 * Services must never instantiate adapters directly.
 */
export class VectorQueryProviderRegistryService {
  constructor(
    private readonly definitionReader: VectorStoreDefinitionReader,
    private readonly connectionReader: VectorStoreConnectionReader,
    private readonly factory: VectorQueryProviderFactory,
  ) {}

  async listSupportedProviderKeys(ctx: ServiceContext): Promise<string[]> {
    assertPermission(ctx, VECTOR_QUERY_PERMISSIONS.view);
    return this.factory.getSupportedProviderKeys();
  }

  async validateConnectionConfiguration(
    ctx: ServiceContext,
    connection: VectorStoreConnectionSnapshot,
  ): Promise<{ valid: boolean; errors: string[] }> {
    assertPermission(ctx, VECTOR_QUERY_PERMISSIONS.manage);
    return this.factory.validateConfiguration(connection.provider_key, connection.configuration);
  }

  async resolveProviderInstance(
    ctx: ServiceContext,
    connection: VectorStoreConnectionSnapshot,
  ): Promise<VectorQueryProvider> {
    assertPermission(ctx, VECTOR_QUERY_PERMISSIONS.execute);
    return this.factory.resolve({
      providerKey: connection.provider_key,
      configuration: enrichProviderConfiguration(connection.configuration, connection.company_id),
    });
  }

  getFactory(): VectorQueryProviderFactory {
    return this.factory;
  }

  getDefinitionReader(): VectorStoreDefinitionReader {
    return this.definitionReader;
  }
}
