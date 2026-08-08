import type { OPPORTUNITY_HISTORY_EVENTS, OPPORTUNITY_STAGE_KEYS } from "./constants.js";

export type OpportunityStageKey = (typeof OPPORTUNITY_STAGE_KEYS)[number];
export type OpportunityHistoryEventType = (typeof OPPORTUNITY_HISTORY_EVENTS)[number];

export type OpportunityServiceContext = {
  userId: string | null;
  companyId: string | null;
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
};

/** Probability model — manual in Sprint 4.0; AI ownership later. */
export type OpportunityProbability = {
  percent: number;
  confidence: number | null;
  source: string;
  reason: string;
};

/** Revenue snapshot — FX / regional pricing placeholders only. */
export type OpportunityRevenueSnapshot = {
  expectedRevenue: number | null;
  weightedRevenue: number | null;
  currency: string;
  exchangeRate: number | null;
  regionalPricing: Record<string, unknown>;
};

/**
 * Canonical Opportunity — references Lead/Customer; does not duplicate CRM conversations.
 * AI context is a creation-time snapshot + live read from source lead.
 */
export type OpportunityRecord = {
  id: string;
  companyId: string;
  pipelineId: string;
  stageId: string;
  name: string;
  leadId: string | null;
  customerId: string | null;
  primaryContactName: string;
  ownerUserId: string | null;
  companyName: string | null;
  country: string | null;
  market: string | null;
  language: string | null;
  currency: string;
  expectedRevenue: number | null;
  weightedRevenue: number | null;
  exchangeRate: number | null;
  regionalPricing: Record<string, unknown>;
  probabilityPercent: number;
  probabilityConfidence: number | null;
  probabilitySource: string;
  probabilityReason: string;
  expectedCloseDate: string | null;
  createdFromLead: boolean;
  aiScoreSnapshot: number | null;
  aiContextSnapshot: Record<string, unknown>;
  currentQuoteId: string | null;
  metadata: Record<string, unknown>;
  wonAt: string | null;
  lostAt: string | null;
  lostReason: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OpportunityStageRecord = {
  id: string;
  companyId: string;
  pipelineId: string;
  name: string;
  slug: string;
  stageKey: OpportunityStageKey;
  sortOrder: number;
  defaultProbabilityPercent: number;
  isTerminal: boolean;
};

export type OpportunityPipelineRecord = {
  id: string;
  companyId: string;
  name: string;
  slug: string;
  isDefault: boolean;
  isActive: boolean;
};

export type OpportunityHistoryRecord = {
  id: string;
  companyId: string;
  opportunityId: string;
  eventType: string;
  fieldName: string | null;
  previousValue: string | null;
  newValue: string | null;
  summary: string;
  payload: Record<string, unknown>;
  actorUserId: string | null;
  createdAt: string;
};

export type Opportunity = {
  id: string;
  name: string;
  leadId: string | null;
  customerId: string | null;
  companyName: string | null;
  primaryContact: string;
  ownerId: string | null;
  owner: string | null;
  stageId: string;
  stage: string;
  stageKey: OpportunityStageKey | null;
  pipelineId: string;
  expectedRevenue: number | null;
  weightedRevenue: number | null;
  currency: string;
  probabilityPercent: number;
  probabilityConfidence: number | null;
  probabilitySource: string;
  probabilityReason: string;
  expectedCloseDate: string | null;
  country: string | null;
  market: string | null;
  language: string | null;
  createdFromLead: boolean;
  aiScoreSnapshot: number | null;
  currentQuoteId: string | null;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
};

export function computeWeightedRevenue(
  expectedRevenue: number | null,
  probabilityPercent: number,
): number | null {
  if (expectedRevenue == null || !Number.isFinite(expectedRevenue)) return null;
  return Math.round(expectedRevenue * (probabilityPercent / 100) * 100) / 100;
}

export function toOpportunity(
  record: OpportunityRecord,
  opts?: {
    tenantId?: string;
    owner?: string | null;
    stage?: string | null;
    stageKey?: OpportunityStageKey | null;
  },
): Opportunity {
  return {
    id: record.id,
    name: record.name,
    leadId: record.leadId,
    customerId: record.customerId,
    companyName: record.companyName,
    primaryContact: record.primaryContactName,
    ownerId: record.ownerUserId,
    owner: opts?.owner ?? null,
    stageId: record.stageId,
    stage: opts?.stage ?? "",
    stageKey: opts?.stageKey ?? null,
    pipelineId: record.pipelineId,
    expectedRevenue: record.expectedRevenue,
    weightedRevenue: record.weightedRevenue,
    currency: record.currency,
    probabilityPercent: record.probabilityPercent,
    probabilityConfidence: record.probabilityConfidence,
    probabilitySource: record.probabilitySource,
    probabilityReason: record.probabilityReason,
    expectedCloseDate: record.expectedCloseDate,
    country: record.country,
    market: record.market,
    language: record.language,
    createdFromLead: record.createdFromLead,
    aiScoreSnapshot: record.aiScoreSnapshot,
    currentQuoteId: record.currentQuoteId,
    tenantId: opts?.tenantId ?? record.companyId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
