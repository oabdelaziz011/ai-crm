import type { OpportunityRepository } from "../repositories/opportunity-repository-port.js";
import type {
  OpportunityHistoryRecord,
  OpportunityPipelineRecord,
  OpportunityRecord,
  OpportunityServiceContext,
  OpportunityStageRecord,
} from "../types.js";
import { OPPORTUNITY_PERMISSIONS } from "../constants.js";
import { OpportunityPermissionError, OpportunityValidationError } from "../errors.js";
import { isOpportunityVisibleInModule } from "./demo-opportunity-visibility.js";

function assertCompany(ctx: OpportunityServiceContext, companyId: string) {
  if (!ctx.isSuperAdmin && ctx.companyId !== companyId) {
    throw new OpportunityPermissionError("tenant");
  }
}

function assertPermission(ctx: OpportunityServiceContext, code: string) {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(code)) throw new OpportunityPermissionError(code);
}

export class OpportunityQueryService {
  constructor(private readonly deps: { opportunities: OpportunityRepository }) {}

  async getById(
    ctx: OpportunityServiceContext,
    companyId: string,
    opportunityId: string,
  ): Promise<OpportunityRecord | null> {
    assertCompany(ctx, companyId);
    assertPermission(ctx, OPPORTUNITY_PERMISSIONS.view);
    const opportunity = await this.deps.opportunities.getOpportunity(companyId, opportunityId);
    if (!opportunity) return null;
    // Module detail must honor the same demo visibility predicate as list/board.
    const lead = opportunity.leadId
      ? await this.deps.opportunities.getLeadSnapshot(companyId, opportunity.leadId)
      : null;
    if (
      !isOpportunityVisibleInModule({
        leadId: opportunity.leadId,
        leadLifecycleStatus: lead?.lifecycleStatus ?? null,
      })
    ) {
      return null;
    }
    return opportunity;
  }

  async list(
    ctx: OpportunityServiceContext,
    input: {
      companyId: string;
      pipelineId?: string;
      stageId?: string;
      ownerUserId?: string;
      leadId?: string;
      query?: string;
      openOnly?: boolean;
      outcome?: "open" | "won" | "lost";
      leadLifecycleStatus?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ items: OpportunityRecord[]; total: number }> {
    assertCompany(ctx, input.companyId);
    assertPermission(ctx, OPPORTUNITY_PERMISSIONS.view);
    return this.deps.opportunities.listOpportunities({
      companyId: input.companyId,
      pipelineId: input.pipelineId,
      stageId: input.stageId,
      ownerUserId: input.ownerUserId,
      leadId: input.leadId,
      query: input.query,
      openOnly: input.openOnly,
      outcome: input.outcome,
      leadLifecycleStatus: input.leadLifecycleStatus,
      applyDemoVisibilityGate: true,
      limit: input.limit ?? 50,
      offset: input.offset ?? 0,
    });
  }

  async listPipelines(
    ctx: OpportunityServiceContext,
    companyId: string,
  ): Promise<OpportunityPipelineRecord[]> {
    assertCompany(ctx, companyId);
    assertPermission(ctx, OPPORTUNITY_PERMISSIONS.view);
    await this.deps.opportunities.ensureDefaultPipeline(companyId);
    return this.deps.opportunities.listPipelines(companyId);
  }

  async listStages(
    ctx: OpportunityServiceContext,
    companyId: string,
    pipelineId: string,
  ): Promise<OpportunityStageRecord[]> {
    assertCompany(ctx, companyId);
    assertPermission(ctx, OPPORTUNITY_PERMISSIONS.view);
    if (!pipelineId) throw new OpportunityValidationError("pipelineId required");
    return this.deps.opportunities.listStages(companyId, pipelineId);
  }

  async listHistory(
    ctx: OpportunityServiceContext,
    companyId: string,
    opportunityId: string,
  ): Promise<OpportunityHistoryRecord[]> {
    assertCompany(ctx, companyId);
    assertPermission(ctx, OPPORTUNITY_PERMISSIONS.view);
    return this.deps.opportunities.listHistory(companyId, opportunityId);
  }

  async getPipelineBoard(
    ctx: OpportunityServiceContext,
    companyId: string,
    pipelineId: string,
  ): Promise<{
    pipelineId: string;
    stages: Array<OpportunityStageRecord & { opportunities: OpportunityRecord[] }>;
  }> {
    assertCompany(ctx, companyId);
    assertPermission(ctx, OPPORTUNITY_PERMISSIONS.view);
    const stages = await this.deps.opportunities.listStages(companyId, pipelineId);
    const { items } = await this.deps.opportunities.listOpportunities({
      companyId,
      pipelineId,
      applyDemoVisibilityGate: true,
      limit: 500,
      offset: 0,
    });
    return {
      pipelineId,
      stages: stages.map((stage) => ({
        ...stage,
        opportunities: items.filter((o) => o.stageId === stage.id),
      })),
    };
  }
}
