import { AI_PROVIDER_PERMISSIONS } from "../constants.js";
import {
  AIProviderConnectionNotFoundError,
  AIProviderDisabledError,
  PermissionDeniedError,
  UnsupportedAIProviderError,
} from "../errors.js";
import type { AIProviderFactory } from "../factory/ai-provider-factory.js";
import type { AIProviderConnectionRepository } from "../repositories/provider-repositories.js";
import type { ProviderHealthCheckResult, ServiceContext } from "../types.js";

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) {
    throw new PermissionDeniedError(permission);
  }
}

function assertCompanyAccess(ctx: ServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) {
    throw new PermissionDeniedError(AI_PROVIDER_PERMISSIONS.view);
  }
}

export class AIProviderHealthService {
  constructor(
    private readonly connectionRepository: AIProviderConnectionRepository,
    private readonly factory: AIProviderFactory,
  ) {}

  async checkConnectionHealth(
    ctx: ServiceContext,
    connectionId: string,
  ): Promise<ProviderHealthCheckResult> {
    assertPermission(ctx, AI_PROVIDER_PERMISSIONS.view);

    const connection = await this.connectionRepository.findById(connectionId);
    if (!connection) throw new AIProviderConnectionNotFoundError(connectionId);
    assertCompanyAccess(ctx, connection.company_id);

    const providerKey = connection.ai_provider_definition?.key;
    if (!providerKey) {
      throw new AIProviderConnectionNotFoundError(connectionId);
    }

    if (!connection.is_enabled) {
      throw new AIProviderDisabledError(providerKey);
    }

    if (!this.factory.isAdapterSupported(providerKey)) {
      throw new UnsupportedAIProviderError(providerKey);
    }

    const provider = await this.factory.resolve({
      providerKey,
      configuration: connection.configuration,
    });

    const health = await provider.health();
    const updated = await this.connectionRepository.updateHealth({
      connectionId,
      healthStatus: health.status,
      lastHealthCheck: health.checkedAt,
    });

    return {
      connectionId: updated.id,
      providerKey,
      healthStatus: updated.health_status,
      message: health.message,
      checkedAt: updated.last_health_check ?? health.checkedAt,
    };
  }

  async checkAllEnabledConnections(
    ctx: ServiceContext,
    companyId: string,
  ): Promise<ProviderHealthCheckResult[]> {
    assertPermission(ctx, AI_PROVIDER_PERMISSIONS.view);
    assertCompanyAccess(ctx, companyId);

    const connections = await this.connectionRepository.list({ companyId, isEnabled: true });
    const results: ProviderHealthCheckResult[] = [];

    for (const connection of connections) {
      const providerKey = connection.ai_provider_definition?.key;
      if (!providerKey || !this.factory.isAdapterSupported(providerKey)) {
        const updated = await this.connectionRepository.updateHealth({
          connectionId: connection.id,
          healthStatus: "warning",
          lastHealthCheck: new Date().toISOString(),
        });
        results.push({
          connectionId: updated.id,
          providerKey: providerKey ?? "unknown",
          healthStatus: updated.health_status,
          message: providerKey
            ? `Adapter for ${providerKey} is not implemented.`
            : "Provider definition missing.",
          checkedAt: updated.last_health_check ?? new Date().toISOString(),
        });
        continue;
      }

      try {
        results.push(await this.checkConnectionHealth(ctx, connection.id));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Health check failed.";
        const updated = await this.connectionRepository.updateHealth({
          connectionId: connection.id,
          healthStatus: "error",
          lastHealthCheck: new Date().toISOString(),
        });
        results.push({
          connectionId: updated.id,
          providerKey,
          healthStatus: updated.health_status,
          message,
          checkedAt: updated.last_health_check ?? new Date().toISOString(),
        });
      }
    }

    return results;
  }
}
