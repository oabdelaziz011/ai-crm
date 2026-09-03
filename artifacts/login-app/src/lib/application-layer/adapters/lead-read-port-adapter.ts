import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  LeadReadPort,
  LeadReadModel,
  LeadListResult,
  LeadPipelineReadModel,
  LeadStageReadModel,
  LeadSourceReadModel,
  LeadPipelineBoardModel,
  LeadDashboardMetricsModel,
  LeadQueueFilter,
} from "@workspace/application-layer";
import type { LeadRecord, LeadSummary } from "@workspace/lead-platform";
import {
  buildLeadReadAccess,
  createLoginAppLeadReadPort,
} from "@/lib/lead-platform/lead-read-port-adapter";
import { EmployeeIdentityService } from "@/lib/employee-identity/employee-identity-service";
import { mapLeadRecordToReadModel, type LeadEnrichmentLabels } from "./lead-record-mapper.js";
import type { LoginAppPortContext } from "./customer-read-port-adapter.js";

function mapPipeline(p: {
  id: string;
  companyId: string;
  name: string;
  slug: string;
  isDefault: boolean;
  isActive: boolean;
  allowBackwardStageMovement?: boolean;
}): LeadPipelineReadModel {
  return Object.freeze({
    id: p.id,
    tenantId: p.companyId,
    name: p.name,
    slug: p.slug,
    isDefault: p.isDefault,
    isActive: p.isActive,
    allowBackwardStageMovement: p.allowBackwardStageMovement !== false,
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

function mapSource(s: {
  id: string;
  companyId: string;
  name: string;
  slug: string;
  channelType: string | null;
  isActive: boolean;
}): LeadSourceReadModel {
  return Object.freeze({
    id: s.id,
    tenantId: s.companyId,
    name: s.name,
    slug: s.slug,
    channelType: s.channelType,
    isActive: s.isActive,
  });
}

async function loadEnrichmentMaps(
  client: SupabaseClient,
  leadReads: ReturnType<typeof createLoginAppLeadReadPort>,
  access: ReturnType<typeof buildLeadReadAccess>,
  tenantId: string,
  leads: Array<LeadRecord | LeadSummary>,
): Promise<{
  stages: Map<string, string>;
  sources: Map<string, string>;
  owners: Map<string, string>;
}> {
  const stages = new Map<string, string>();
  const sources = new Map<string, string>();
  const owners = new Map<string, string>();

  const pipelineIds = [...new Set(leads.map((lead) => lead.pipelineId).filter(Boolean))];

  const [sourceResult, companyIdentities] = await Promise.all([
    leadReads.listSources(access, { companyId: tenantId }),
    EmployeeIdentityService.listByCompany(tenantId),
    Promise.all(
      pipelineIds.map(async (pipelineId) => {
        const { stages: stageRows } = await leadReads.listStages(access, {
          companyId: tenantId,
          pipelineId,
        });
        for (const stage of stageRows) {
          stages.set(stage.id, stage.name);
        }
      }),
    ),
  ]);

  for (const source of sourceResult.sources) {
    sources.set(source.id, source.name);
  }

  for (const identity of companyIdentities) {
    owners.set(identity.id, identity.fullName);
    if (identity.userId) owners.set(identity.userId, identity.fullName);
  }

  // Resolve any remaining owner ids not in company list (e.g. cross-ref).
  const missingOwnerIds = [
    ...new Set(
      leads
        .map((lead) => lead.assignedUserId)
        .filter((id): id is string => typeof id === "string" && id.length > 0 && !owners.has(id)),
    ),
  ];
  if (missingOwnerIds.length > 0) {
    const extra = await EmployeeIdentityService.getManyByIds(missingOwnerIds);
    for (const [id, identity] of extra) {
      owners.set(id, identity.fullName);
      owners.set(identity.id, identity.fullName);
      if (identity.userId) owners.set(identity.userId, identity.fullName);
    }
  }

  // Resolve any stage ids not covered by pipeline lists.
  const missingStageIds = [
    ...new Set(leads.map((lead) => lead.stageId).filter((id) => id && !stages.has(id))),
  ];
  if (missingStageIds.length > 0) {
    const { data } = await client
      .from("lead_stages")
      .select("id, name")
      .eq("company_id", tenantId)
      .in("id", missingStageIds);
    for (const row of data ?? []) {
      stages.set(String(row.id), String(row.name));
    }
  }

  return { stages, sources, owners };
}

function resolveLabels(
  lead: LeadRecord | LeadSummary,
  maps: { stages: Map<string, string>; sources: Map<string, string>; owners: Map<string, string> },
): LeadEnrichmentLabels {
  const sourceId = "sourceId" in lead ? lead.sourceId : null;
  const stageName = maps.stages.get(lead.stageId);
  if (!stageName) {
    throw new Error(`Stage name missing for stageId=${lead.stageId}`);
  }
  const ownerId = lead.assignedUserId;
  const owner = ownerId ? maps.owners.get(ownerId) ?? null : null;
  if (ownerId && !owner) {
    throw new Error(`Owner display name missing for ownerId=${ownerId}`);
  }
  const source = sourceId ? maps.sources.get(sourceId) ?? null : null;
  if (sourceId && !source) {
    throw new Error(`Source display name missing for sourceId=${sourceId}`);
  }
  return { owner, stage: stageName, source };
}

function mapEnriched(
  lead: LeadRecord | LeadSummary,
  tenantId: string,
  maps: { stages: Map<string, string>; sources: Map<string, string>; owners: Map<string, string> },
): LeadReadModel {
  return mapLeadRecordToReadModel(lead, tenantId, resolveLabels(lead, maps));
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
      if (!lead) return null;
      const maps = await loadEnrichmentMaps(client, leadReads, access, tenantId, [lead]);
      return mapEnriched(lead, tenantId, maps);
    },

    async findByCustomer(tenantId, customerId) {
      if (tenantId !== ctx.companyId || !guard()) return null;
      const { lead } = await leadReads.getLeadByCustomer(access, { companyId: tenantId, customerId });
      if (!lead) return null;
      const maps = await loadEnrichmentMaps(client, leadReads, access, tenantId, [lead]);
      return mapEnriched(lead, tenantId, maps);
    },

    async search(tenantId, query, limit = 10) {
      if (tenantId !== ctx.companyId || !guard()) return [];
      const { leads } = await leadReads.searchLeads(access, { companyId: tenantId, query, limit });
      const maps = await loadEnrichmentMaps(client, leadReads, access, tenantId, leads);
      return leads.map((lead) => mapEnriched(lead, tenantId, maps));
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
        assignedUserId: filter?.ownerId,
        lifecycleStatus: filter?.lifecycleStatus,
        limit: filter?.limit ?? 50,
        offset: filter?.offset ?? 0,
      });
      const maps = await loadEnrichmentMaps(client, leadReads, access, tenantId, leads);
      return Object.freeze({
        items: Object.freeze(leads.map((lead) => mapEnriched(lead, tenantId, maps))),
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

    async listSources(tenantId) {
      if (tenantId !== ctx.companyId || !guard()) return [];
      const { sources } = await leadReads.listSources(access, { companyId: tenantId });
      return sources.map(mapSource);
    },

    async getPipelineBoard(tenantId, pipelineId): Promise<LeadPipelineBoardModel> {
      if (tenantId !== ctx.companyId || !guard()) {
        throw new Error("Permission denied");
      }
      const { pipeline, stages } = await leadReads.listPipeline(access, {
        companyId: tenantId,
        pipelineId,
      });
      if (!pipeline) throw new Error("Pipeline not found");

      const { leads } = await leadReads.searchLeads(access, {
        companyId: tenantId,
        pipelineId,
        limit: 500,
        offset: 0,
      });
      const maps = await loadEnrichmentMaps(client, leadReads, access, tenantId, leads);

      const leadsByStage: Record<string, LeadReadModel[]> = {};
      for (const stage of stages) {
        leadsByStage[stage.id] = [];
      }
      for (const lead of leads) {
        const mapped = mapEnriched(lead, tenantId, maps);
        if (!leadsByStage[lead.stageId]) leadsByStage[lead.stageId] = [];
        leadsByStage[lead.stageId].push(mapped);
      }

      const stageModels = stages.map((stage) => {
        const stageLeads = leadsByStage[stage.id] ?? [];
        return mapStage(stage, {
          leadCount: stageLeads.length,
          totalValue: stageLeads.reduce((sum, l) => sum + (l.expectedValue ?? 0), 0),
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
      const metrics = await leadReads.fetchDashboardMetrics(access, {
        companyId: tenantId,
        periodStartIso,
      });
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
