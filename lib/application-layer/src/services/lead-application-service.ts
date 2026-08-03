import type { ApplicationContext, CommandResult, QueryResult } from "../contracts/application-context.js";
import type { ApplicationLayerDeps } from "./application-services.js";
import { CommandPipeline, QueryPipeline } from "../pipeline/command-query-pipeline.js";
import { Lead360Aggregator } from "../aggregator/lead360-aggregator.js";
import type { Lead360AggregateDto, Lead360AggregateRequestDto } from "../dto/lead360-aggregate-dto.js";
import type {
  LeadCreateInput,
  LeadUpdateInput,
  LeadQueueFilter,
  LeadReadModel,
  LeadPipelineBoardModel,
  LeadDashboardMetricsModel,
} from "../ports/repository-ports.js";
import type { ConvertLeadRequestDto, ConvertLeadResponseDto } from "../dto/command-dtos.js";
import * as LeadCommandHandlers from "../handlers/commands/lead-command-handlers.js";

export type CreateLeadRequestDto = Readonly<Omit<LeadCreateInput, "tenantId" | "actorUserId">>;
export type UpdateLeadRequestDto = Readonly<{ leadId: string; patch: Omit<LeadUpdateInput, "actorUserId"> }>;
export type AssignLeadRequestDto = Readonly<{ leadId: string; assigneeUserId: string }>;
export type ChangeLeadStageRequestDto = Readonly<{ leadId: string; stageId: string }>;
export type BulkChangeLeadStageRequestDto = Readonly<{ leadIds: readonly string[]; stageId: string }>;
export type ArchiveLeadRequestDto = Readonly<{ leadId: string }>;

export type LeadListQueryRequestDto = Readonly<LeadQueueFilter>;
export type LeadListQueryResponseDto = Readonly<{
  items: readonly LeadReadModel[];
  total: number;
}>;

export type LeadPipelineQueryRequestDto = Readonly<{ pipelineId: string }>;
export type LeadDashboardQueryRequestDto = Readonly<{ periodStartIso?: string }>;

export class LeadApplicationService {
  private readonly aggregator: Lead360Aggregator;

  constructor(private readonly deps: ApplicationLayerDeps) {
    this.aggregator = new Lead360Aggregator({ ports: deps.ports });
  }

  getLead360Aggregate(
    request: Lead360AggregateRequestDto,
    context: ApplicationContext,
  ): Promise<QueryResult<Lead360AggregateDto | null>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "Lead360Aggregate",
      request,
      context,
      requiredPermissions: ["leads.view"],
      handler: async (req) => this.aggregator.aggregate({ leadId: req.leadId, pipelineId: req.pipelineId }, context),
    });
  }

  listLeads(
    request: LeadListQueryRequestDto,
    context: ApplicationContext,
  ): Promise<QueryResult<LeadListQueryResponseDto>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "LeadList",
      request,
      context,
      requiredPermissions: ["leads.view"],
      handler: async (req, ctx) => {
        const result = await this.deps.ports.leadRead.list(ctx.tenantId, req);
        return Object.freeze({ items: Object.freeze(result.items), total: result.total });
      },
    });
  }

  getPipelineBoard(
    request: LeadPipelineQueryRequestDto,
    context: ApplicationContext,
  ): Promise<QueryResult<LeadPipelineBoardModel>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "LeadPipeline",
      request,
      context,
      requiredPermissions: ["leads.view"],
      handler: async (req, ctx) => this.deps.ports.leadRead.getPipelineBoard(ctx.tenantId, req.pipelineId),
    });
  }

  getDashboardMetrics(
    request: LeadDashboardQueryRequestDto,
    context: ApplicationContext,
  ): Promise<QueryResult<LeadDashboardMetricsModel>> {
    const pipeline = this.deps.queryPipeline ?? new QueryPipeline();
    return pipeline.execute({
      queryType: "LeadDashboard",
      request,
      context,
      requiredPermissions: ["leads.view"],
      handler: async (req, ctx) =>
        this.deps.ports.leadRead.getDashboardMetrics(ctx.tenantId, req.periodStartIso),
    });
  }

  createLead(
    request: CreateLeadRequestDto,
    context: ApplicationContext,
  ): Promise<CommandResult<LeadReadModel>> {
    const cmdPipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmdPipeline.execute({
      commandType: "CreateLead",
      request,
      context,
      requiredPermissions: ["leads.create"],
      handler: async (req, ctx) => {
        const { response } = await LeadCommandHandlers.handleCreateLead(
          { ports: this.deps.ports, infra: this.deps.infra },
          req,
          ctx,
        );
        return response;
      },
    });
  }

  updateLead(
    request: UpdateLeadRequestDto,
    context: ApplicationContext,
  ): Promise<CommandResult<LeadReadModel>> {
    const cmdPipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmdPipeline.execute({
      commandType: "UpdateLead",
      request,
      context,
      requiredPermissions: ["leads.edit"],
      handler: async (req, ctx) => {
        const { response } = await LeadCommandHandlers.handleUpdateLead(
          { ports: this.deps.ports, infra: this.deps.infra },
          req,
          ctx,
        );
        return response;
      },
    });
  }

  assignLead(
    request: AssignLeadRequestDto,
    context: ApplicationContext,
  ): Promise<CommandResult<LeadReadModel>> {
    const cmdPipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmdPipeline.execute({
      commandType: "AssignLead",
      request,
      context,
      requiredPermissions: ["leads.assign"],
      handler: async (req, ctx) => {
        const { response } = await LeadCommandHandlers.handleAssignLead(
          { ports: this.deps.ports, infra: this.deps.infra },
          req,
          ctx,
        );
        return response;
      },
    });
  }

  changeStage(
    request: ChangeLeadStageRequestDto,
    context: ApplicationContext,
  ): Promise<CommandResult<LeadReadModel>> {
    const cmdPipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmdPipeline.execute({
      commandType: "ChangeLeadStage",
      request,
      context,
      requiredPermissions: ["leads.edit"],
      handler: async (req, ctx) => {
        const { response } = await LeadCommandHandlers.handleChangeLeadStage(
          { ports: this.deps.ports, infra: this.deps.infra },
          req,
          ctx,
        );
        return response;
      },
    });
  }

  bulkChangeStage(
    request: BulkChangeLeadStageRequestDto,
    context: ApplicationContext,
  ): Promise<CommandResult<{ updated: number }>> {
    const cmdPipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmdPipeline.execute({
      commandType: "BulkChangeLeadStage",
      request,
      context,
      requiredPermissions: ["leads.edit"],
      handler: async (req, ctx) => {
        const { response } = await LeadCommandHandlers.handleBulkChangeLeadStage(
          { ports: this.deps.ports, infra: this.deps.infra },
          req,
          ctx,
        );
        return response;
      },
    });
  }

  convertLead(
    request: ConvertLeadRequestDto,
    context: ApplicationContext,
  ): Promise<CommandResult<ConvertLeadResponseDto>> {
    const cmdPipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmdPipeline.execute({
      commandType: "ConvertLead",
      request,
      context,
      requiredPermissions: ["leads.convert"],
      handler: async (req, ctx) => {
        const { response } = await LeadCommandHandlers.handleConvertLead(
          { ports: this.deps.ports, infra: this.deps.infra },
          req,
          ctx,
        );
        return response;
      },
    });
  }

  archiveLead(
    request: ArchiveLeadRequestDto,
    context: ApplicationContext,
  ): Promise<CommandResult<{ archived: true }>> {
    const cmdPipeline = this.deps.commandPipeline ?? new CommandPipeline({ audit: this.deps.infra.audit });
    return cmdPipeline.execute({
      commandType: "ArchiveLead",
      request,
      context,
      requiredPermissions: ["leads.delete"],
      handler: async (req, ctx) => {
        const { response } = await LeadCommandHandlers.handleArchiveLead(
          { ports: this.deps.ports, infra: this.deps.infra },
          req,
          ctx,
        );
        return response;
      },
    });
  }
}
