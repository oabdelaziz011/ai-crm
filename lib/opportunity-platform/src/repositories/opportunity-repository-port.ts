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
  primaryProductId?: string | null;
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
  primaryProductId?: string | null;
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
    customerId?: string;
    primaryProductId?: string;
    /** When true, only rows with won_at and lost_at both null. */
    openOnly?: boolean;
    /** Terminal outcome filter (mutually exclusive with openOnly when won/lost). */
    outcome?: "open" | "won" | "lost";
    query?: string;
    /** Kanban lifecycle (`leads.lifecycle_status`), e.g. demo_completed. */
    leadLifecycleStatus?: string;
    /**
     * When true, exclude Opportunities whose Lead has not reached `demo_completed`
     * (Kanban فرصة). Internal command reuse must pass false.
     */
    applyDemoVisibilityGate?: boolean;
    limit: number;
    offset: number;
  }): Promise<{ items: OpportunityRecord[]; total: number }>;

  /** Lead ids whose Opportunities must stay hidden until Kanban فرصة (`demo_completed`). */
  listDemoVisibilityBlockedLeadIds(companyId: string): Promise<string[]>;

  /**
   * Find an open opportunity for the commercial uniqueness key
   * (company + customer + primary_product). Returns null when any key part is missing.
   */
  findOpenByCustomerProduct(input: {
    companyId: string;
    customerId: string;
    primaryProductId: string;
  }): Promise<OpportunityRecord | null>;

  /**
   * Tenant-scoped catalog product lookup. Returns null when the product is missing,
   * soft-deleted, or belongs to another company (cross-company rejection).
   */
  getCatalogProductInCompany(
    companyId: string,
    productId: string,
  ): Promise<{ id: string; companyId: string; name: string } | null>;

  /**
   * Tenant-scoped customer lookup. Returns null when the customer is missing or
   * belongs to another company (cross-company rejection). Never invents identity.
   */
  getCustomerInCompany(
    companyId: string,
    customerId: string,
  ): Promise<{ id: string; companyId: string } | null>;

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
    /** Persisted leads.lifecycle_status — used for Opportunities module visibility. */
    lifecycleStatus?: string | null;
    score: number;
    aiSummary: string;
    metadata: Record<string, unknown>;
  } | null>;

  findCustomerByEmail(companyId: string, email: string): Promise<LeadCustomerEmailMatch>;

  attachLeadToCustomer(companyId: string, leadId: string, customerId: string): Promise<void>;
}

export type { OpportunityStageKey };
