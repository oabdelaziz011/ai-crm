import type {
  OpportunityHistoryRecord,
  OpportunityPipelineRecord,
  OpportunityRecord,
  OpportunityStageKey,
  OpportunityStageRecord,
} from "../types.js";

export type CreateOpportunityInput = {
  companyId: string;
  pipelineId: string;
  stageId: string;
  name: string;
  leadId?: string | null;
  customerId?: string | null;
  primaryContactName?: string;
  ownerUserId?: string | null;
  companyName?: string | null;
  country?: string | null;
  market?: string | null;
  language?: string | null;
  currency?: string;
  expectedRevenue?: number | null;
  weightedRevenue?: number | null;
  exchangeRate?: number | null;
  regionalPricing?: Record<string, unknown>;
  probabilityPercent: number;
  probabilityConfidence?: number | null;
  probabilitySource?: string;
  probabilityReason?: string;
  expectedCloseDate?: string | null;
  createdFromLead?: boolean;
  aiScoreSnapshot?: number | null;
  aiContextSnapshot?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdBy: string | null;
};

export type UpdateOpportunityInput = {
  companyId: string;
  opportunityId: string;
  updatedBy: string | null;
  name?: string;
  stageId?: string;
  ownerUserId?: string | null;
  companyName?: string | null;
  primaryContactName?: string;
  country?: string | null;
  market?: string | null;
  language?: string | null;
  currency?: string;
  expectedRevenue?: number | null;
  weightedRevenue?: number | null;
  exchangeRate?: number | null;
  probabilityPercent?: number;
  probabilityConfidence?: number | null;
  probabilitySource?: string;
  probabilityReason?: string;
  expectedCloseDate?: string | null;
  customerId?: string | null;
  wonAt?: string | null;
  lostAt?: string | null;
  lostReason?: string | null;
  metadata?: Record<string, unknown>;
};

export type LeadCustomerEmailMatch =
  | { kind: "none" }
  | { kind: "found"; customerId: string }
  | { kind: "duplicate"; count: number };

export interface OpportunityRepository {
  ensureDefaultPipeline(companyId: string): Promise<string>;
  getDefaultStage(companyId: string, pipelineId: string): Promise<OpportunityStageRecord | null>;
  getStage(companyId: string, stageId: string): Promise<OpportunityStageRecord | null>;
  listPipelines(companyId: string): Promise<OpportunityPipelineRecord[]>;
  listStages(companyId: string, pipelineId: string): Promise<OpportunityStageRecord[]>;

  createOpportunity(input: CreateOpportunityInput): Promise<OpportunityRecord>;
  updateOpportunity(input: UpdateOpportunityInput): Promise<OpportunityRecord>;
  softDeleteOpportunity(companyId: string, opportunityId: string, updatedBy: string | null): Promise<void>;
  getOpportunity(companyId: string, opportunityId: string): Promise<OpportunityRecord | null>;
  listOpportunities(input: {
    companyId: string;
    pipelineId?: string;
    stageId?: string;
    ownerUserId?: string;
    leadId?: string;
    query?: string;
    limit: number;
    offset: number;
  }): Promise<{ items: OpportunityRecord[]; total: number }>;

  addHistory(input: {
    companyId: string;
    opportunityId: string;
    eventType: string;
    fieldName?: string | null;
    previousValue?: string | null;
    newValue?: string | null;
    summary?: string;
    payload?: Record<string, unknown>;
    actorUserId: string | null;
  }): Promise<OpportunityHistoryRecord>;

  listHistory(companyId: string, opportunityId: string, limit?: number): Promise<OpportunityHistoryRecord[]>;

  /** Minimal lead read for create-from-lead — no conversation duplication. */
  getLeadSnapshot(
    companyId: string,
    leadId: string,
  ): Promise<{
    id: string;
    title: string;
    contactName: string;
    companyName: string | null;
    email: string | null;
    customerId: string | null;
    assignedUserId: string | null;
    estimatedValue: number | null;
    currency: string;
    expectedCloseDate: string | null;
    language: string | null;
    territory: string | null;
    isQualified: boolean;
    score: number;
    aiSummary: string;
    metadata: Record<string, unknown>;
  } | null>;

  findCustomerByEmail(companyId: string, email: string): Promise<LeadCustomerEmailMatch>;

  attachLeadToCustomer(companyId: string, leadId: string, customerId: string): Promise<void>;
}

export type { OpportunityStageKey };
