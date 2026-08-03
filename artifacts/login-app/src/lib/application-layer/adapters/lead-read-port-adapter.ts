import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  LeadReadPort,
  LeadReadModel,
  LeadListResult,
  LeadPipelineReadModel,
  LeadStageReadModel,
  LeadPipelineBoardModel,
  LeadDashboardMetricsModel,
  LeadQueueFilter,
} from "@workspace/application-layer";
import {
  buildLeadReadAccess,
  createLoginAppLeadReadPort,
} from "@/lib/lead-platform/lead-read-port-adapter";
import { mapLeadRecordToReadModel } from "./lead-record-mapper.js";
import type { LoginAppPortContext } from "./customer-read-port-adapter.js";

function mapPipeline(p: {
  id: string;
  companyId: string;
  name: string;
  slug: string;
  isDefault: boolean;
  isActive: boolean;
}): LeadPipelineReadModel {
  return Object.freeze({
    id: p.id,
    tenantId: p.companyId,
    name: p.name,
    slug: p.slug,
    isDefault: p.isDefault,
    isActive: p.isActive,
  });
}

function mapStage(
  s: {
    id: string;
    companyId: string;
    pipelineId: string;
    name: string;
    slug: string;
    lifecycleStatus: string;
    sortOrder: number;
    probabilityPercent: number;
    isTerminal: boolean;
  },
  extras?: { leadCount?: number; totalValue?: number },
): LeadStageReadModel {
  return Object.freeze({
    id: s.id,
    tenantId: s.companyId,
    pipelineId: s.pipelineId,
    name: s.name,
    slug: s.slug,
    lifecycleStatus: s.lifecycleStatus,
    sortOrder: s.sortOrder,
    probabilityPercent: s.probabilityPercent,
    isTerminal: s.isTerminal,
    leadCount: extras?.leadCount,
    totalValue: extras?.totalValue,
  });
}

export function createLoginAppLeadReadPortAdapter(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): LeadReadPort {
  const leadReads = createLoginAppLeadReadPort(client);
  const access = buildLeadReadAccess({
    companyId: ctx.companyId,
    actorUserId: ctx.actorUserId,
    isSuperAdmin: ctx.isSuperAdmin,
    hasPermission: ctx.hasPermission,
  });

  const guard = () => ctx.hasPermission("leads.view") || ctx.isSuperAdmin;

  return {
    async getById(tenantId, leadId) {
      if (tenantId !== ctx.companyId || !guard()) return null;
      const { lead } = await leadReads.getLead(access, { companyId: tenantId, leadId });
      return lead ? mapLeadRecordToReadModel(lead, tenantId) : null;
    },

    async findByCustomer(tenantId, customerId) {
      if (tenantId !== ctx.companyId || !guard()) return null;
      const { lead } = await leadReads.getLeadByCustomer(access, { companyId: tenantId, customerId });
      return lead ? mapLeadRecordToReadModel(lead, tenantId) : null;
    },

    async search(tenantId, query, limit = 10) {
      if (tenantId !== ctx.companyId || !guard()) return [];
      const { leads } = await leadReads.searchLeads(access, { companyId: tenantId, query, limit });
      return leads.map((lead) => mapLeadRecordToReadModel(lead, tenantId));
    },

    async list(tenantId, filter?: LeadQueueFilter): Promise<LeadListResult> {
      if (tenantId !== ctx.companyId || !guard()) {
        return Object.freeze({ items: Object.freeze([]), total: 0 });
      }
      const { leads, total } = await leadReads.searchLeads(access, {
        companyId: tenantId,
        query: filter?.search,
        stageId: filter?.stageId,
        pipelineId: filter?.pipelineId,
        assignedUserId: filter?.assignedUserId,
        lifecycleStatus: filter?.lifecycleStatus,
        limit: filter?.limit ?? 50,
        offset: filter?.offset ?? 0,
      });
      return Object.freeze({
        items: Object.freeze(leads.map((lead) => mapLeadRecordToReadModel(lead, tenantId))),
        total,
      });
    },

    async listPipelines(tenantId) {
      if (tenantId !== ctx.companyId || !guard()) return [];
      const { pipelines } = await leadReads.listPipelines(access, { companyId: tenantId });
      return pipelines.map(mapPipeline);
    },

    async listStages(tenantId, pipelineId) {
      if (tenantId !== ctx.companyId || !guard()) return [];
      const { stages } = await leadReads.listStages(access, { companyId: tenantId, pipelineId });
      return stages.map((stage) => mapStage(stage));
    },

    async getPipelineBoard(tenantId, pipelineId): Promise<LeadPipelineBoardModel> {
      if (tenantId !== ctx.companyId || !guard()) {
        throw new Error("Permission denied");
      }
      const { pipeline, stages } = await leadReads.listPipeline(access, { companyId: tenantId, pipelineId });
      if (!pipeline) throw new Error("Pipeline not found");

      const { leads } = await leadReads.searchLeads(access, {
        companyId: tenantId,
        pipelineId,
        limit: 500,
        offset: 0,
      });

      const leadsByStage: Record<string, LeadReadModel[]> = {};
      for (const stage of stages) {
        leadsByStage[stage.id] = [];
      }
      for (const lead of leads) {
        const mapped = mapLeadRecordToReadModel(lead, tenantId);
        if (!leadsByStage[lead.stageId]) leadsByStage[lead.stageId] = [];
        leadsByStage[lead.stageId].push(mapped);
      }

      const stageModels = stages.map((stage) => {
        const stageLeads = leadsByStage[stage.id] ?? [];
        return mapStage(stage, {
          leadCount: stageLeads.length,
          totalValue: stageLeads.reduce((sum, l) => sum + (l.estimatedValue ?? 0), 0),
        });
      });

      return Object.freeze({
        pipeline: mapPipeline(pipeline),
        stages: Object.freeze(stageModels),
        leadsByStage: Object.freeze(
          Object.fromEntries(
            Object.entries(leadsByStage).map(([stageId, items]) => [stageId, Object.freeze(items)]),
          ),
        ),
      });
    },

    async getDashboardMetrics(tenantId, periodStartIso?): Promise<LeadDashboardMetricsModel> {
      if (tenantId !== ctx.companyId || !guard()) {
        return Object.freeze({
          totalLeads: 0,
          leadsByStatus: Object.freeze({}),
          conversionsInPeriod: 0,
          createdInPeriod: 0,
          forecastValue: 0,
          conversionRate: 0,
          pipelineMetrics: Object.freeze([]),
        });
      }
      const metrics = await leadReads.fetchDashboardMetrics(access, { companyId: tenantId, periodStartIso });
      return Object.freeze({
        totalLeads: metrics.totalLeads,
        leadsByStatus: Object.freeze({ ...metrics.leadsByStatus }),
        conversionsInPeriod: metrics.conversionsInPeriod,
        createdInPeriod: metrics.createdInPeriod,
        forecastValue: metrics.forecastValue,
        conversionRate: metrics.conversionRate,
        pipelineMetrics: Object.freeze(
          metrics.pipelineMetrics.map((p) =>
            Object.freeze({
              pipelineId: p.pipelineId,
              pipelineName: p.pipelineName,
              leadCount: p.leadCount,
              pipelineValue: p.pipelineValue,
            }),
          ),
        ),
      });
    },
  };
}
