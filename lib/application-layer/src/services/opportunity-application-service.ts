import type { ApplicationContext, CommandResult, QueryResult } from "../contracts/application-context.js";
import type { ApplicationLayerDeps } from "./application-services.js";
import { CommandPipeline, QueryPipeline } from "../pipeline/command-query-pipeline.js";
import type {
  OpportunityCreateFromLeadInput,
  OpportunityCreateInput,
  OpportunityHistoryReadModel,
  OpportunityListFilter,
  OpportunityPipelineBoardModel,
  OpportunityPipelineReadModel,
  OpportunityProbabilityInput,
  OpportunityReadModel,
  OpportunityStageReadModel,
  OpportunityUpdateInput,
} from "../ports/repository-ports.js";

export class OpportunityApplicationService {
  constructor(private readonly deps: ApplicationLayerDeps) {}

  getOpportunity(
    opportunityId: string,
    context: ApplicationContext,
  ): Promise<QueryResult<OpportunityReadModel | null>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "OpportunityGet",
      request: { opportunityId },
      context,
      requiredPermissions: ["opportunities.view"],
      handler: async (req, ctx) => this.deps.ports.opportunityRead.getById(ctx.tenantId, req.opportunityId),
    });
  }

  listOpportunities(
    request: OpportunityListFilter,
    context: ApplicationContext,
  ): Promise<QueryResult<{ items: readonly OpportunityReadModel[]; total: number }>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "OpportunityList",
      request,
      context,
      requiredPermissions: ["opportunities.view"],
      handler: async (req, ctx) => this.deps.ports.opportunityRead.list(ctx.tenantId, req),
    });
  }

  listPipelines(context: ApplicationContext): Promise<QueryResult<OpportunityPipelineReadModel[]>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "OpportunityPipelines",
      request: {},
      context,
      requiredPermissions: ["opportunities.view"],
      handler: async (_req, ctx) => this.deps.ports.opportunityRead.listPipelines(ctx.tenantId),
    });
  }

  listStages(
    request: { pipelineId: string },
    context: ApplicationContext,
  ): Promise<QueryResult<OpportunityStageReadModel[]>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "OpportunityStages",
      request,
      context,
      requiredPermissions: ["opportunities.view"],
      handler: async (req, ctx) => this.deps.ports.opportunityRead.listStages(ctx.tenantId, req.pipelineId),
    });
  }

  getPipelineBoard(
    request: { pipelineId: string },
    context: ApplicationContext,
  ): Promise<QueryResult<OpportunityPipelineBoardModel>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "OpportunityPipelineBoard",
      request,
      context,
      requiredPermissions: ["opportunities.view"],
      handler: async (req, ctx) =>
        this.deps.ports.opportunityRead.getPipelineBoard(ctx.tenantId, req.pipelineId),
    });
  }

  listHistory(
    opportunityId: string,
    context: ApplicationContext,
  ): Promise<QueryResult<OpportunityHistoryReadModel[]>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "OpportunityHistory",
      request: { opportunityId },
      context,
      requiredPermissions: ["opportunities.view"],
      handler: async (req, ctx) =>
        this.deps.ports.opportunityRead.listHistory(ctx.tenantId, req.opportunityId),
    });
  }

  createOpportunity(
    request: Omit<OpportunityCreateInput, "tenantId" | "actorUserId">,
    context: ApplicationContext,
  ): Promise<CommandResult<OpportunityReadModel>> {
    const cmdPipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmdPipeline.execute({
      commandType: "CreateOpportunity",
      request,
      context,
      requiredPermissions: ["opportunities.create"],
      handler: async (req, ctx) =>
        this.deps.ports.opportunityWrite.create({
          ...req,
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorId,
        }),
    });
  }

  createFromLead(
    request: Omit<OpportunityCreateFromLeadInput, "tenantId" | "actorUserId">,
    context: ApplicationContext,
  ): Promise<CommandResult<OpportunityReadModel>> {
    const cmdPipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmdPipeline.execute({
      commandType: "CreateOpportunityFromLead",
      request,
      context,
      requiredPermissions: ["opportunities.convert"],
      handler: async (req, ctx) =>
        this.deps.ports.opportunityWrite.createFromLead({
          ...req,
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorId,
        }),
    });
  }

  updateOpportunity(
    request: { opportunityId: string; patch: Omit<OpportunityUpdateInput, "actorUserId"> },
    context: ApplicationContext,
  ): Promise<CommandResult<OpportunityReadModel>> {
    const cmdPipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmdPipeline.execute({
      commandType: "UpdateOpportunity",
      request,
      context,
      requiredPermissions: ["opportunities.edit"],
      handler: async (req, ctx) =>
        this.deps.ports.opportunityWrite.update(ctx.tenantId, req.opportunityId, {
          ...req.patch,
          actorUserId: ctx.actorId,
        }),
    });
  }

  changeStage(
    request: { opportunityId: string; stageId: string },
    context: ApplicationContext,
  ): Promise<CommandResult<OpportunityReadModel>> {
    const cmdPipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmdPipeline.execute({
      commandType: "ChangeOpportunityStage",
      request,
      context,
      requiredPermissions: ["opportunities.edit"],
      handler: async (req, ctx) =>
        this.deps.ports.opportunityWrite.changeStage(
          ctx.tenantId,
          req.opportunityId,
          req.stageId,
          ctx.actorId,
        ),
    });
  }

  updateProbability(
    request: { opportunityId: string } & Omit<OpportunityProbabilityInput, "actorUserId">,
    context: ApplicationContext,
  ): Promise<CommandResult<OpportunityReadModel>> {
    const cmdPipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmdPipeline.execute({
      commandType: "UpdateOpportunityProbability",
      request,
      context,
      requiredPermissions: ["opportunities.edit"],
      handler: async (req, ctx) => {
        const { opportunityId, ...rest } = req;
        return this.deps.ports.opportunityWrite.updateProbability(ctx.tenantId, opportunityId, {
          ...rest,
          actorUserId: ctx.actorId,
        });
      },
    });
  }

  archiveOpportunity(
    request: { opportunityId: string },
    context: ApplicationContext,
  ): Promise<CommandResult<void>> {
    const cmdPipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmdPipeline.execute({
      commandType: "ArchiveOpportunity",
      request,
      context,
      requiredPermissions: ["opportunities.delete"],
      handler: async (req, ctx) => {
        await this.deps.ports.opportunityWrite.archive(ctx.tenantId, req.opportunityId, ctx.actorId);
      },
    });
  }
}
