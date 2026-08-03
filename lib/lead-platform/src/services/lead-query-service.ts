import { LEAD_PERMISSIONS, LEAD_QUERY_CACHE_TTL } from "../constants.js";
import type { LeadQueryCachePort } from "../cache/lead-query-cache-port.js";
import { buildLeadQueryCacheKey } from "../cache/lead-query-cache-port.js";
import type { LeadRepository } from "../repositories/lead-repository-port.js";
import type {
  LeadMetricsSnapshot,
  LeadRecord,
  LeadServiceContext,
  PipelineMetricsSnapshot,
} from "../types/lead-types.js";
import { assertLeadCompanyAccess, assertLeadPermission } from "../validators/lead-guards.js";

export type LeadQueryServiceDeps = {
  leads: LeadRepository;
  cache: LeadQueryCachePort;
};

export class LeadQueryService {
  constructor(private readonly deps: LeadQueryServiceDeps) {}

  async getLead(ctx: LeadServiceContext, input: { companyId: string; leadId: string }) {
    assertLeadCompanyAccess(ctx, input.companyId);
    assertLeadPermission(ctx, LEAD_PERMISSIONS.view);
    const lead = await this.deps.leads.getLead(input.companyId, input.leadId);
    return { lead };
  }

  async getLeadByConversation(
    ctx: LeadServiceContext,
    input: { companyId: string; conversationId: string },
  ) {
    assertLeadCompanyAccess(ctx, input.companyId);
    assertLeadPermission(ctx, LEAD_PERMISSIONS.view);
    const lead = await this.deps.leads.getLeadByConversation(input.companyId, input.conversationId);
    return { lead };
  }

  async getLeadByCustomer(ctx: LeadServiceContext, input: { companyId: string; customerId: string }) {
    assertLeadCompanyAccess(ctx, input.companyId);
    assertLeadPermission(ctx, LEAD_PERMISSIONS.view);
    const lead = await this.deps.leads.getLeadByCustomer(input.companyId, input.customerId);
    return { lead };
  }

  async searchLeads(
    ctx: LeadServiceContext,
    input: {
      companyId: string;
      query?: string;
      lifecycleStatus?: string;
      stageId?: string;
      pipelineId?: string;
      assignedUserId?: string;
      isQualified?: boolean;
      limit?: number;
      offset?: number;
    },
  ) {
    assertLeadCompanyAccess(ctx, input.companyId);
    assertLeadPermission(ctx, LEAD_PERMISSIONS.view);
    return this.deps.leads.searchLeads({
      companyId: input.companyId,
      query: input.query,
      lifecycleStatus: input.lifecycleStatus,
      stageId: input.stageId,
      pipelineId: input.pipelineId,
      assignedUserId: input.assignedUserId,
      isQualified: input.isQualified,
      limit: input.limit ?? 25,
      offset: input.offset ?? 0,
    });
  }

  async listPipeline(ctx: LeadServiceContext, input: { companyId: string; pipelineId: string }) {
    assertLeadCompanyAccess(ctx, input.companyId);
    assertLeadPermission(ctx, LEAD_PERMISSIONS.view);
    const pipeline = await this.deps.leads.getPipeline(input.companyId, input.pipelineId);
    const stages = await this.deps.leads.listStages(input.companyId, input.pipelineId);
    if (!pipeline) return { pipeline: null, stages: [] };
    return { pipeline, stages };
  }

  async listStages(ctx: LeadServiceContext, input: { companyId: string; pipelineId: string }) {
    assertLeadCompanyAccess(ctx, input.companyId);
    assertLeadPermission(ctx, LEAD_PERMISSIONS.view);
    const stages = await this.deps.leads.listStages(input.companyId, input.pipelineId);
    return { stages };
  }

  async listPipelines(ctx: LeadServiceContext, input: { companyId: string }) {
    assertLeadCompanyAccess(ctx, input.companyId);
    assertLeadPermission(ctx, LEAD_PERMISSIONS.view);
    const pipelines = await this.deps.leads.listPipelines(input.companyId);
    return { pipelines };
  }

  async listLeadActivities(
    ctx: LeadServiceContext,
    input: { companyId: string; leadId: string; limit?: number },
  ) {
    assertLeadCompanyAccess(ctx, input.companyId);
    assertLeadPermission(ctx, LEAD_PERMISSIONS.view);
    const activities = await this.deps.leads.listActivities(input.companyId, input.leadId, input.limit ?? 50);
    return { activities };
  }

  async listLeadHistory(
    ctx: LeadServiceContext,
    input: { companyId: string; leadId: string; limit?: number },
  ) {
    assertLeadCompanyAccess(ctx, input.companyId);
    assertLeadPermission(ctx, LEAD_PERMISSIONS.view);
    const history = await this.deps.leads.listHistory(input.companyId, input.leadId, input.limit ?? 50);
    return { history };
  }

  async listLeadNotes(ctx: LeadServiceContext, input: { companyId: string; leadId: string }) {
    assertLeadCompanyAccess(ctx, input.companyId);
    assertLeadPermission(ctx, LEAD_PERMISSIONS.view);
    const notes = await this.deps.leads.listNotes(input.companyId, input.leadId);
    return { notes };
  }

  async listLeadTags(ctx: LeadServiceContext, input: { companyId: string; leadId: string }) {
    assertLeadCompanyAccess(ctx, input.companyId);
    assertLeadPermission(ctx, LEAD_PERMISSIONS.view);
    const tags = await this.deps.leads.listTags(input.companyId, input.leadId);
    return { tags };
  }

  async listAssignedLeads(
    ctx: LeadServiceContext,
    input: { companyId: string; assigneeUserId: string; limit?: number },
  ) {
    assertLeadCompanyAccess(ctx, input.companyId);
    assertLeadPermission(ctx, LEAD_PERMISSIONS.view);
    const result = await this.deps.leads.searchLeads({
      companyId: input.companyId,
      assignedUserId: input.assigneeUserId,
      limit: input.limit ?? 50,
      offset: 0,
    });
    return { leads: result.leads };
  }

  async listCompanyLeads(
    ctx: LeadServiceContext,
    input: { companyId: string; limit?: number; offset?: number },
  ) {
    assertLeadCompanyAccess(ctx, input.companyId);
    assertLeadPermission(ctx, LEAD_PERMISSIONS.view);
    return this.deps.leads.searchLeads({
      companyId: input.companyId,
      limit: input.limit ?? 50,
      offset: input.offset ?? 0,
    });
  }

  async fetchPipelineMetrics(
    ctx: LeadServiceContext,
    input: { companyId: string; pipelineId: string },
  ): Promise<PipelineMetricsSnapshot> {
    assertLeadCompanyAccess(ctx, input.companyId);
    assertLeadPermission(ctx, LEAD_PERMISSIONS.view);
    const cacheKey = buildLeadQueryCacheKey({
      kind: "pipeline_metrics",
      companyId: input.companyId,
      pipelineId: input.pipelineId,
    });
    const cached = await this.deps.cache.get<PipelineMetricsSnapshot>(cacheKey);
    if (cached) return cached;
    const metrics = await this.deps.leads.fetchPipelineMetrics(input.companyId, input.pipelineId);
    await this.deps.cache.set(cacheKey, metrics, LEAD_QUERY_CACHE_TTL.pipeline);
    return metrics;
  }

  async fetchForecastMetrics(ctx: LeadServiceContext, input: { companyId: string }) {
    assertLeadCompanyAccess(ctx, input.companyId);
    assertLeadPermission(ctx, LEAD_PERMISSIONS.view);
    const metrics = await this.fetchDashboardMetrics(ctx, { companyId: input.companyId });
    return { forecastValue: metrics.forecastValue, conversionRate: metrics.conversionRate };
  }

  async fetchDashboardMetrics(
    ctx: LeadServiceContext,
    input: { companyId: string; periodStartIso?: string },
  ): Promise<LeadMetricsSnapshot> {
    assertLeadCompanyAccess(ctx, input.companyId);
    assertLeadPermission(ctx, LEAD_PERMISSIONS.view);
    const periodStartIso = input.periodStartIso ?? new Date(Date.now() - 30 * 86400000).toISOString();
    const cacheKey = buildLeadQueryCacheKey({
      kind: "metrics",
      companyId: input.companyId,
      periodStart: periodStartIso,
    });
    const cached = await this.deps.cache.get<LeadMetricsSnapshot>(cacheKey);
    if (cached) return cached;
    const metrics = await this.deps.leads.fetchMetrics(input.companyId, periodStartIso);
    await this.deps.cache.set(cacheKey, metrics, LEAD_QUERY_CACHE_TTL.metrics);
    return metrics;
  }
}

export type { LeadRecord };
