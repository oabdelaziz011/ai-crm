import { DEFAULT_CURRENCY, AI_OBSERVABILITY_PERMISSIONS } from "../constants.js";
import { PermissionDeniedError } from "../errors.js";
import type { ExecutionAnalyticsRepository } from "../repositories/observability-repositories.js";
import type {
  AnalyticsAggregate,
  ListAnalyticsFilter,
  RecordExecutionAnalyticsInput,
  ServiceContext,
} from "../types.js";
import type { CostAccountingService } from "./cost-accounting-service.js";
import { estimateTokenCost } from "../utils/cost-utils.js";
import { assertAnalyticsFeatureEnabled } from "../utils/analytics-guards.js";

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) {
    throw new PermissionDeniedError(permission);
  }
}

function assertCompanyAccess(ctx: ServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) {
    throw new PermissionDeniedError(AI_OBSERVABILITY_PERMISSIONS.analyticsView);
  }
}

export class ExecutionAnalyticsService {
  constructor(
    private readonly analyticsRepository: ExecutionAnalyticsRepository,
    private readonly costAccountingService: CostAccountingService,
  ) {}

  async recordExecutionAnalytics(ctx: ServiceContext, input: RecordExecutionAnalyticsInput) {
    assertPermission(ctx, AI_OBSERVABILITY_PERMISSIONS.analyticsManage);
    assertCompanyAccess(ctx, input.companyId);

    const { estimatedCost, currency } = estimateTokenCost(input.tokenUsage);

    const analytics = await this.analyticsRepository.create({
      companyId: input.companyId,
      traceId: input.traceContext.traceRecordId,
      correlationId: input.traceContext.correlationId,
      executionId: input.executionId ?? null,
      conversationId: input.conversationId ?? input.traceContext.conversationId ?? null,
      providerKey: input.providerKey,
      model: input.model,
      promptBuildId: input.promptBuildId ?? null,
      templateKey: input.templateKey ?? null,
      templateVersionId: input.templateVersionId ?? null,
      latencyMs: input.latencyMs,
      retryCount: input.retryCount,
      usedFallback: input.usedFallback,
      hadTimeout: input.hadTimeout,
      promptTokens: input.tokenUsage.prompt_tokens,
      completionTokens: input.tokenUsage.completion_tokens,
      totalTokens: input.tokenUsage.total_tokens,
      estimatedCost,
      currency,
      executionStatus: input.executionStatus,
    });

    await this.costAccountingService.recordTokenCost(ctx, {
      companyId: input.companyId,
      traceId: input.traceContext.traceRecordId,
      executionId: input.executionId ?? null,
      providerKey: input.providerKey,
      model: input.model,
      tokenUsage: input.tokenUsage,
      currency,
    });

    return analytics;
  }

  async listAnalytics(ctx: ServiceContext, filter: ListAnalyticsFilter) {
    assertPermission(ctx, AI_OBSERVABILITY_PERMISSIONS.analyticsView);
    assertAnalyticsFeatureEnabled(ctx);
    assertCompanyAccess(ctx, filter.companyId);
    return this.analyticsRepository.list(filter);
  }

  async aggregateMetrics(ctx: ServiceContext, filter: ListAnalyticsFilter): Promise<AnalyticsAggregate> {
    assertPermission(ctx, AI_OBSERVABILITY_PERMISSIONS.analyticsView);
    assertAnalyticsFeatureEnabled(ctx);
    assertCompanyAccess(ctx, filter.companyId);

    const records = await this.analyticsRepository.list(filter);
    const aggregate: AnalyticsAggregate = {
      totalExecutions: records.length,
      totalLatencyMs: 0,
      averageLatencyMs: 0,
      totalRetries: 0,
      timeoutCount: 0,
      fallbackCount: 0,
      totalTokens: 0,
      totalEstimatedCost: 0,
      currency: records[0]?.currency ?? DEFAULT_CURRENCY,
      byProvider: {},
      byStatus: {},
    };

    for (const record of records) {
      aggregate.totalLatencyMs += record.latency_ms;
      aggregate.totalRetries += record.retry_count;
      aggregate.timeoutCount += record.had_timeout ? 1 : 0;
      aggregate.fallbackCount += record.used_fallback ? 1 : 0;
      aggregate.totalTokens += record.total_tokens;
      aggregate.totalEstimatedCost += record.estimated_cost;
      aggregate.byStatus[record.execution_status] = (aggregate.byStatus[record.execution_status] ?? 0) + 1;

      if (!aggregate.byProvider[record.provider_key]) {
        aggregate.byProvider[record.provider_key] = {
          executions: 0,
          totalTokens: 0,
          totalCost: 0,
          averageLatencyMs: 0,
        };
      }

      const providerBucket = aggregate.byProvider[record.provider_key];
      providerBucket.executions += 1;
      providerBucket.totalTokens += record.total_tokens;
      providerBucket.totalCost += record.estimated_cost;
      providerBucket.averageLatencyMs += record.latency_ms;
    }

    if (aggregate.totalExecutions > 0) {
      aggregate.averageLatencyMs = Math.round(aggregate.totalLatencyMs / aggregate.totalExecutions);
    }

    for (const providerKey of Object.keys(aggregate.byProvider)) {
      const bucket = aggregate.byProvider[providerKey];
      bucket.averageLatencyMs =
        bucket.executions > 0 ? Math.round(bucket.averageLatencyMs / bucket.executions) : 0;
      bucket.totalCost = Math.round(bucket.totalCost * 1_000_000) / 1_000_000;
    }

    aggregate.totalEstimatedCost = Math.round(aggregate.totalEstimatedCost * 1_000_000) / 1_000_000;
    return aggregate;
  }
}
