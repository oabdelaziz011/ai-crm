import { PROVIDER_CONNECTION_STATUSES, VECTOR_STORE_PERMISSIONS } from "../constants.js";
import {
  PermissionDeniedError,
  ValidationError,
  VectorStoreConnectionNotFoundError,
  VectorStoreProviderNotFoundError,
} from "../errors.js";
import type { VectorStoreProviderFactory } from "../factory/vector-store-provider-factory.js";
import type {
  VectorStoreConnectionRepository,
  VectorStoreDefinitionRepository,
} from "../repositories/vector-store-repositories.js";
import type {
  CreateVectorStoreConnectionInput,
  ListVectorStoreConnectionsFilter,
  ServiceContext,
  UpdateVectorStoreConnectionInput,
  VectorStoreConnectionRecord,
  VectorStoreDefinitionRecord,
} from "../types.js";
import { enrichProviderConfiguration } from "../utils/enrich-provider-configuration.js";
import { mergeConfiguration } from "../utils/validate-configuration.js";

function assertCompanyAccess(ctx: ServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) {
    throw new PermissionDeniedError(VECTOR_STORE_PERMISSIONS.view);
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

export class VectorStoreProviderRegistryService {
  constructor(
    private readonly definitionRepository: VectorStoreDefinitionRepository,
    private readonly connectionRepository: VectorStoreConnectionRepository,
    private readonly factory: VectorStoreProviderFactory,
  ) {}

  async listProviderTypes(ctx: ServiceContext): Promise<VectorStoreDefinitionRecord[]> {
    assertPermission(ctx, VECTOR_STORE_PERMISSIONS.view);
    return this.definitionRepository.listActive();
  }

  async getProviderType(ctx: ServiceContext, key: string): Promise<VectorStoreDefinitionRecord> {
    assertPermission(ctx, VECTOR_STORE_PERMISSIONS.view);
    const provider = await this.definitionRepository.findByKey(key);
    if (!provider) throw new VectorStoreProviderNotFoundError(key);
    return provider;
  }

  async getSupportedAdapterKeys(ctx: ServiceContext): Promise<string[]> {
    assertPermission(ctx, VECTOR_STORE_PERMISSIONS.view);
    return this.factory.getSupportedProviderKeys();
  }

  async listConnections(
    ctx: ServiceContext,
    filter: ListVectorStoreConnectionsFilter,
  ): Promise<VectorStoreConnectionRecord[]> {
    assertPermission(ctx, VECTOR_STORE_PERMISSIONS.view);
    assertCompanyAccess(ctx, filter.companyId);
    return this.connectionRepository.list(filter);
  }

  async getConnection(ctx: ServiceContext, connectionId: string): Promise<VectorStoreConnectionRecord> {
    assertPermission(ctx, VECTOR_STORE_PERMISSIONS.view);
    const connection = await this.connectionRepository.findById(connectionId);
    if (!connection) throw new VectorStoreConnectionNotFoundError(connectionId);
    assertCompanyAccess(ctx, connection.company_id);
    return connection;
  }

  async createConnection(
    ctx: ServiceContext,
    input: CreateVectorStoreConnectionInput,
  ): Promise<VectorStoreConnectionRecord> {
    assertPermission(ctx, VECTOR_STORE_PERMISSIONS.manage);
    assertCompanyAccess(ctx, input.companyId);

    const providerType = await this.definitionRepository.findById(input.providerId);
    if (!providerType || !providerType.is_active) {
      throw new ValidationError("Selected vector store provider type is not available.");
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
    input: UpdateVectorStoreConnectionInput,
  ): Promise<VectorStoreConnectionRecord> {
    assertPermission(ctx, VECTOR_STORE_PERMISSIONS.manage);

    const existing = await this.getConnection(ctx, input.connectionId);
    const providerType = existing.vector_store_definition;
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

  async activateConnection(ctx: ServiceContext, connectionId: string): Promise<VectorStoreConnectionRecord> {
    assertPermission(ctx, VECTOR_STORE_PERMISSIONS.manage);

    const connection = await this.getConnection(ctx, connectionId);
    const providerKey = connection.vector_store_definition?.key;
    if (!providerKey) {
      throw new ValidationError("Connection provider definition is missing.");
    }

    const provider = await this.factory.resolve({
      providerKey,
      configuration: enrichProviderConfiguration(connection.configuration, connection.company_id),
    });
    const health = await provider.health();

    return this.connectionRepository.update({
      connectionId,
      isEnabled: true,
      status: "active",
      healthStatus: health.status,
      lastHealthCheck: health.checkedAt,
    });
  }

  async disconnectConnection(ctx: ServiceContext, connectionId: string): Promise<VectorStoreConnectionRecord> {
    assertPermission(ctx, VECTOR_STORE_PERMISSIONS.manage);
    await this.getConnection(ctx, connectionId);

    return this.connectionRepository.update({
      connectionId,
      isEnabled: false,
      status: "disabled",
      healthStatus: "disconnected",
      lastHealthCheck: new Date().toISOString(),
    });
  }

  async checkConnectionHealth(ctx: ServiceContext, connectionId: string): Promise<VectorStoreConnectionRecord> {
    assertPermission(ctx, VECTOR_STORE_PERMISSIONS.view);

    const connection = await this.getConnection(ctx, connectionId);
    const providerKey = connection.vector_store_definition?.key;
    if (!providerKey) {
      throw new ValidationError("Connection provider definition is missing.");
    }

    const provider = await this.factory.resolve({
      providerKey,
      configuration: enrichProviderConfiguration(connection.configuration, connection.company_id),
    });
    const health = await provider.health();

    return this.connectionRepository.update({
      connectionId,
      healthStatus: health.status,
      lastHealthCheck: health.checkedAt,
    });
  }
}
