import type {
  LeadActivityRecord,
  LeadHistoryRecord,
  LeadMetricsSnapshot,
  LeadNoteRecord,
  LeadPipelineRecord,
  LeadRecord,
  LeadServiceContext,
  LeadSourceRecord,
  LeadStageRecord,
  LeadSummary,
  LeadTagRecord,
  PipelineMetricsSnapshot,
} from "../types/lead-types.js";

export type LeadReadAccessContext = LeadServiceContext;

export interface LeadReadPort {
  getLead(
    access: LeadReadAccessContext,
    input: { companyId: string; leadId: string },
  ): Promise<{ lead: LeadRecord | null }>;

  getLeadByConversation(
    access: LeadReadAccessContext,
    input: { companyId: string; conversationId: string },
  ): Promise<{ lead: LeadRecord | null }>;

  getLeadByCustomer(
    access: LeadReadAccessContext,
    input: { companyId: string; customerId: string },
  ): Promise<{ lead: LeadRecord | null }>;

  searchLeads(
    access: LeadReadAccessContext,
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
  ): Promise<{ leads: LeadSummary[]; total: number }>;

  listPipeline(
    access: LeadReadAccessContext,
    input: { companyId: string; pipelineId: string },
  ): Promise<{ pipeline: LeadPipelineRecord; stages: LeadStageRecord[] }>;

  listStages(
    access: LeadReadAccessContext,
    input: { companyId: string; pipelineId: string },
  ): Promise<{ stages: LeadStageRecord[] }>;

  listPipelines(
    access: LeadReadAccessContext,
    input: { companyId: string },
  ): Promise<{ pipelines: LeadPipelineRecord[] }>;

  listLeadActivities(
    access: LeadReadAccessContext,
    input: { companyId: string; leadId: string; limit?: number },
  ): Promise<{ activities: LeadActivityRecord[] }>;

  listLeadHistory(
    access: LeadReadAccessContext,
    input: { companyId: string; leadId: string; limit?: number },
  ): Promise<{ history: LeadHistoryRecord[] }>;

  listLeadNotes(
    access: LeadReadAccessContext,
    input: { companyId: string; leadId: string },
  ): Promise<{ notes: LeadNoteRecord[] }>;

  listLeadTags(
    access: LeadReadAccessContext,
    input: { companyId: string; leadId: string },
  ): Promise<{ tags: LeadTagRecord[] }>;

  listAssignedLeads(
    access: LeadReadAccessContext,
    input: { companyId: string; assigneeUserId: string; limit?: number },
  ): Promise<{ leads: LeadSummary[] }>;

  listCompanyLeads(
    access: LeadReadAccessContext,
    input: { companyId: string; limit?: number; offset?: number },
  ): Promise<{ leads: LeadSummary[]; total: number }>;

  fetchPipelineMetrics(
    access: LeadReadAccessContext,
    input: { companyId: string; pipelineId: string },
  ): Promise<PipelineMetricsSnapshot>;

  fetchForecastMetrics(
    access: LeadReadAccessContext,
    input: { companyId: string },
  ): Promise<{ forecastValue: number; conversionRate: number }>;

  fetchDashboardMetrics(
    access: LeadReadAccessContext,
    input: { companyId: string; periodStartIso?: string },
  ): Promise<LeadMetricsSnapshot>;
}
