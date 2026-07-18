import { DEFAULT_CURRENCY } from "../constants.js";
import { AI_OBSERVABILITY_PERMISSIONS } from "../constants.js";
import { PermissionDeniedError } from "../errors.js";
import type { TokenCostRepository } from "../repositories/observability-repositories.js";
import type { CompanyCostAggregate, ListCostRecordsFilter, RecordTokenCostInput, ServiceContext } from "../types.js";
import { estimateTokenCost } from "../utils/cost-utils.js";
import { resolveBillingPeriod } from "../utils/trace-utils.js";

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) {
    throw new PermissionDeniedError(permission);
  }
}

function assertCompanyAccess(ctx: ServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) {
    throw new PermissionDeniedError(AI_OBSERVABILITY_PERMISSIONS.costsView);
  }
}

export class CostAccountingService {
  constructor(private readonly costRepository: TokenCostRepository) {}

  async recordTokenCost(ctx: ServiceContext, input: RecordTokenCostInput) {
    assertPermission(ctx, AI_OBSERVABILITY_PERMISSIONS.analyticsManage);

    const { estimatedCost, currency } = estimateTokenCost(input.tokenUsage);
    const billingPeriod = input.billingPeriod ?? resolveBillingPeriod();

    return this.costRepository.create({
      companyId: input.companyId,
      traceId: input.traceId ?? null,
      executionId: input.executionId ?? null,
      billingPeriod,
      providerKey: input.providerKey,
      model: input.model,
      promptTokens: input.tokenUsage.prompt_tokens,
      completionTokens: input.tokenUsage.completion_tokens,
      totalTokens: input.tokenUsage.total_tokens,
      estimatedCost,
      currency: input.currency ?? currency,
    });
  }

  async listCostRecords(ctx: ServiceContext, filter: ListCostRecordsFilter) {
    assertPermission(ctx, AI_OBSERVABILITY_PERMISSIONS.costsView);
    assertCompanyAccess(ctx, filter.companyId);
    return this.costRepository.list(filter);
  }

  async aggregateCompanyCosts(
    ctx: ServiceContext,
    input: { companyId: string; billingPeriod?: string },
  ): Promise<CompanyCostAggregate> {
    assertPermission(ctx, AI_OBSERVABILITY_PERMISSIONS.costsView);
    assertCompanyAccess(ctx, input.companyId);

    const billingPeriod = input.billingPeriod ?? resolveBillingPeriod();
    const records = await this.costRepository.list({
      companyId: input.companyId,
      billingPeriod,
    });

    const aggregate: CompanyCostAggregate = {
      companyId: input.companyId,
      billingPeriod,
      totalTokens: 0,
      totalCost: 0,
      currency: records[0]?.currency ?? DEFAULT_CURRENCY,
      recordCount: records.length,
      byProvider: {},
    };

    for (const record of records) {
      aggregate.totalTokens += record.total_tokens;
      aggregate.totalCost += record.estimated_cost;

      if (!aggregate.byProvider[record.provider_key]) {
        aggregate.byProvider[record.provider_key] = {
          totalTokens: 0,
          totalCost: 0,
          recordCount: 0,
        };
      }

      const bucket = aggregate.byProvider[record.provider_key];
      bucket.totalTokens += record.total_tokens;
      bucket.totalCost += record.estimated_cost;
      bucket.recordCount += 1;
    }

    aggregate.totalCost = Math.round(aggregate.totalCost * 1_000_000) / 1_000_000;
    for (const providerKey of Object.keys(aggregate.byProvider)) {
      aggregate.byProvider[providerKey].totalCost =
        Math.round(aggregate.byProvider[providerKey].totalCost * 1_000_000) / 1_000_000;
    }

    return aggregate;
  }
}
