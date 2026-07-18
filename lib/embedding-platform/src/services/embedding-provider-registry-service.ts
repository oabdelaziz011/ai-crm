import { EMBEDDING_PERMISSIONS, PROVIDER_CONNECTION_STATUSES } from "../constants.js";
import {
  EmbeddingProviderConnectionNotFoundError,
  EmbeddingProviderNotFoundError,
  PermissionDeniedError,
  ValidationError,
} from "../errors.js";
import type { EmbeddingProviderFactory } from "../factory/embedding-provider-factory.js";
import type {
  EmbeddingProviderConnectionRepository,
  EmbeddingProviderDefinitionRepository,
} from "../repositories/embedding-repositories.js";
import type {
  CreateEmbeddingProviderConnectionInput,
  EmbeddingProviderConnectionRecord,
  EmbeddingProviderDefinitionRecord,
  ListEmbeddingProviderConnectionsFilter,
  ServiceContext,
  UpdateEmbeddingProviderConnectionInput,
} from "../types.js";
import { mergeConfiguration } from "../utils/validate-configuration.js";

function assertCompanyAccess(ctx: ServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) {
    throw new PermissionDeniedError(EMBEDDING_PERMISSIONS.view);
  }
}

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) {
    throw new PermissionDeniedError(permission);
  }
}

function validateConnectionStatus(value: string): void {
  if (!PROVIDER_CONNECTION_STATUSES.includes(value as (typeof PROVIDER_CONNECTION_STATUSES)[number])) {
    throw new ValidationError(`Unsupported provider connection status: ${value}`);
  }
}

export class EmbeddingProviderRegistryService {
  constructor(
    private readonly definitionRepository: EmbeddingProviderDefinitionRepository,
    private readonly connectionRepository: EmbeddingProviderConnectionRepository,
    private readonly factory: EmbeddingProviderFactory,
  ) {}

  async listProviderTypes(ctx: ServiceContext): Promise<EmbeddingProviderDefinitionRecord[]> {
    assertPermission(ctx, EMBEDDING_PERMISSIONS.view);
    return this.definitionRepository.listActive();
  }

  async getProviderType(ctx: ServiceContext, key: string): Promise<EmbeddingProviderDefinitionRecord> {
    assertPermission(ctx, EMBEDDING_PERMISSIONS.view);
    const provider = await this.definitionRepository.findByKey(key);
    if (!provider) throw new EmbeddingProviderNotFoundError(key);
    return provider;
  }

  async getSupportedAdapterKeys(ctx: ServiceContext): Promise<string[]> {
    assertPermission(ctx, EMBEDDING_PERMISSIONS.view);
    return this.factory.getSupportedProviderKeys();
  }

  async listConnections(
    ctx: ServiceContext,
    filter: ListEmbeddingProviderConnectionsFilter,
  ): Promise<EmbeddingProviderConnectionRecord[]> {
    assertPermission(ctx, EMBEDDING_PERMISSIONS.view);
    assertCompanyAccess(ctx, filter.companyId);
    return this.connectionRepository.list(filter);
  }

  async getConnection(ctx: ServiceContext, connectionId: string): Promise<EmbeddingProviderConnectionRecord> {
    assertPermission(ctx, EMBEDDING_PERMISSIONS.view);
    const connection = await this.connectionRepository.findById(connectionId);
    if (!connection) throw new EmbeddingProviderConnectionNotFoundError(connectionId);
    assertCompanyAccess(ctx, connection.company_id);
    return connection;
  }

  async createConnection(
    ctx: ServiceContext,
    input: CreateEmbeddingProviderConnectionInput,
  ): Promise<EmbeddingProviderConnectionRecord> {
    assertPermission(ctx, EMBEDDING_PERMISSIONS.manage);
    assertCompanyAccess(ctx, input.companyId);

    const providerType = await this.definitionRepository.findById(input.providerId);
    if (!providerType || !providerType.is_active) {
      throw new ValidationError("Selected embedding provider type is not available.");
    }

    if (!this.factory.isAdapterSupported(providerType.key)) {
      throw new ValidationError(`Provider ${providerType.key} does not have an adapter implementation yet.`);
    }

    if (input.status) validateConnectionStatus(input.status);

    const mergedConfiguration = mergeConfiguration(providerType.default_configuration, input.configuration ?? {});
    const validation = await this.factory.validateConfiguration(providerType.key, mergedConfiguration);
    if (!validation.valid) {
      throw new ValidationError(validation.errors.join("; "));
    }

    return this.connectionRepository.create({
      ...input,
      configuration: mergedConfiguration,
    });
  }

  async updateConnection(
    ctx: ServiceContext,
    input: UpdateEmbeddingProviderConnectionInput,
  ): Promise<EmbeddingProviderConnectionRecord> {
    assertPermission(ctx, EMBEDDING_PERMISSIONS.manage);

    const existing = await this.getConnection(ctx, input.connectionId);
    const providerType = existing.embedding_provider_definition;
    if (!providerType) {
      throw new ValidationError("Connection provider definition is missing.");
    }

    if (input.status) validateConnectionStatus(input.status);

    if (input.configuration) {
      const mergedConfiguration = mergeConfiguration(providerType.default_configuration, input.configuration);
      const validation = await this.factory.validateConfiguration(providerType.key, mergedConfiguration);
      if (!validation.valid) {
        throw new ValidationError(validation.errors.join("; "));
      }
      input = { ...input, configuration: mergedConfiguration };
    }

    return this.connectionRepository.update(input);
  }
}
