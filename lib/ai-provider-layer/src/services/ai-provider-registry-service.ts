import { AI_PROVIDER_PERMISSIONS, PROVIDER_CONNECTION_STATUSES, PROVIDER_HEALTH_STATUSES } from "../constants.js";
import {
  AIProviderConnectionNotFoundError,
  AIProviderNotFoundError,
  PermissionDeniedError,
  ValidationError,
} from "../errors.js";
import type { AIProviderFactory } from "../factory/ai-provider-factory.js";
import type {
  AIProviderConnectionRepository,
  AIProviderDefinitionRepository,
} from "../repositories/provider-repositories.js";
import type {
  AIProviderConnectionRecord,
  AIProviderDefinitionRecord,
  CreateAIProviderConnectionInput,
  ListAIProviderConnectionsFilter,
  ServiceContext,
  UpdateAIProviderConnectionInput,
} from "../types.js";
import { mergeConfiguration } from "../utils/validate-configuration.js";

function assertCompanyAccess(ctx: ServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) {
    throw new PermissionDeniedError(AI_PROVIDER_PERMISSIONS.view);
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

export class AIProviderRegistryService {
  constructor(
    private readonly definitionRepository: AIProviderDefinitionRepository,
    private readonly connectionRepository: AIProviderConnectionRepository,
    private readonly factory: AIProviderFactory,
  ) {}

  async listProviderTypes(ctx: ServiceContext): Promise<AIProviderDefinitionRecord[]> {
    assertPermission(ctx, AI_PROVIDER_PERMISSIONS.view);
    return this.definitionRepository.listActive();
  }

  async getProviderType(ctx: ServiceContext, key: string): Promise<AIProviderDefinitionRecord> {
    assertPermission(ctx, AI_PROVIDER_PERMISSIONS.view);
    const provider = await this.definitionRepository.findByKey(key);
    if (!provider) throw new AIProviderNotFoundError(key);
    return provider;
  }

  async getSupportedAdapterKeys(ctx: ServiceContext): Promise<string[]> {
    assertPermission(ctx, AI_PROVIDER_PERMISSIONS.view);
    return this.factory.getSupportedProviderKeys();
  }

  async listConnections(
    ctx: ServiceContext,
    filter: ListAIProviderConnectionsFilter,
  ): Promise<AIProviderConnectionRecord[]> {
    assertPermission(ctx, AI_PROVIDER_PERMISSIONS.view);
    assertCompanyAccess(ctx, filter.companyId);
    return this.connectionRepository.list(filter);
  }

  async getConnection(ctx: ServiceContext, connectionId: string): Promise<AIProviderConnectionRecord> {
    assertPermission(ctx, AI_PROVIDER_PERMISSIONS.view);
    const connection = await this.connectionRepository.findById(connectionId);
    if (!connection) throw new AIProviderConnectionNotFoundError(connectionId);
    assertCompanyAccess(ctx, connection.company_id);
    return connection;
  }

  async createConnection(
    ctx: ServiceContext,
    input: CreateAIProviderConnectionInput,
  ): Promise<AIProviderConnectionRecord> {
    assertPermission(ctx, AI_PROVIDER_PERMISSIONS.manage);
    assertCompanyAccess(ctx, input.companyId);

    const providerType = await this.definitionRepository.findById(input.providerId);
    if (!providerType || !providerType.is_active) {
      throw new ValidationError("Selected AI provider type is not available.");
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
    input: UpdateAIProviderConnectionInput,
  ): Promise<AIProviderConnectionRecord> {
    assertPermission(ctx, AI_PROVIDER_PERMISSIONS.manage);

    const existing = await this.getConnection(ctx, input.connectionId);
    const providerKey = existing.ai_provider_definition?.key;
    if (!providerKey) {
      throw new ValidationError("Provider definition is missing for this connection.");
    }

    if (input.status) validateConnectionStatus(input.status);

    const mergedConfiguration =
      input.configuration !== undefined
        ? mergeConfiguration(existing.ai_provider_definition?.default_configuration ?? {}, input.configuration)
        : undefined;

    if (mergedConfiguration) {
      const validation = await this.factory.validateConfiguration(providerKey, mergedConfiguration);
      if (!validation.valid) {
        throw new ValidationError(validation.errors.join("; "));
      }
    }

    return this.connectionRepository.update({
      ...input,
      configuration: mergedConfiguration,
    });
  }

  async disableConnection(ctx: ServiceContext, connectionId: string): Promise<AIProviderConnectionRecord> {
    assertPermission(ctx, AI_PROVIDER_PERMISSIONS.manage);
    await this.getConnection(ctx, connectionId);
    return this.connectionRepository.update({
      connectionId,
      isEnabled: false,
      status: "disabled",
    });
  }

  async validateConnectionConfiguration(
    ctx: ServiceContext,
    connectionId: string,
  ): Promise<{ valid: boolean; errors: string[] }> {
    const connection = await this.getConnection(ctx, connectionId);
    const providerKey = connection.ai_provider_definition?.key;
    if (!providerKey) {
      return { valid: false, errors: ["Provider definition is missing for this connection."] };
    }
    return this.factory.validateConfiguration(providerKey, connection.configuration);
  }
}
