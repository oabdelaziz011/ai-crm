import { AI_EXECUTION_PERMISSIONS } from "../constants.js";
import { AIExecutionMetricsNotFoundError, AIExecutionNotFoundError, PermissionDeniedError } from "../errors.js";
import type { AIExecutionMetricsRepository, AIExecutionRepository } from "../repositories/execution-repositories.js";
import type { ListAIExecutionMetricsFilter, ListAIExecutionsFilter, ServiceContext } from "../types.js";

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) {
    throw new PermissionDeniedError(permission);
  }
}

function assertCompanyAccess(ctx: ServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) {
    throw new PermissionDeniedError(AI_EXECUTION_PERMISSIONS.view);
  }
}

export class AIExecutionMetricsService {
  constructor(
    private readonly executionRepository: AIExecutionRepository,
    private readonly metricsRepository: AIExecutionMetricsRepository,
  ) {}

  async getExecutionMetrics(ctx: ServiceContext, executionId: string) {
    assertPermission(ctx, AI_EXECUTION_PERMISSIONS.view);
    const execution = await this.executionRepository.findById(executionId);
    if (!execution) throw new AIExecutionNotFoundError(executionId);
    assertCompanyAccess(ctx, execution.company_id);

    const metrics = await this.metricsRepository.findByExecutionId(executionId);
    if (!metrics) throw new AIExecutionMetricsNotFoundError(executionId);
    return { execution, metrics };
  }

  async listMetrics(ctx: ServiceContext, filter: ListAIExecutionMetricsFilter) {
    assertPermission(ctx, AI_EXECUTION_PERMISSIONS.view);
    assertCompanyAccess(ctx, filter.companyId);
    return this.metricsRepository.list(filter);
  }

  async listExecutions(ctx: ServiceContext, filter: ListAIExecutionsFilter) {
    assertPermission(ctx, AI_EXECUTION_PERMISSIONS.view);
    assertCompanyAccess(ctx, filter.companyId);
    return this.executionRepository.list(filter);
  }
}
