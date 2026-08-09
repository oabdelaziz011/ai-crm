import type {
  ASSIGNMENT_METHODS,
  LEAD_LIFECYCLE_STATUSES,
  LEAD_PRIORITIES,
} from "../constants.js";

export type LeadLifecycleStatus = (typeof LEAD_LIFECYCLE_STATUSES)[number];
export type LeadPriority = (typeof LEAD_PRIORITIES)[number];
export type AssignmentMethod = (typeof ASSIGNMENT_METHODS)[number];

export type LeadServiceContext = {
  userId: string | null;
  companyId: string | null;
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
};

export type LeadTemperature = "hot" | "warm" | "cold";

export type LeadRecord = {
  id: string;
  companyId: string;
  pipelineId: string;
  stageId: string;
  sourceId: string | null;
  lifecycleStatus: LeadLifecycleStatus;
  /** CRM "Lead Name" — persisted as title */
  title: string;
  /** CRM "Contact Person" — persisted as contact_name */
  contactName: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  priority: LeadPriority;
  /** CRM "Expected Value" — persisted as estimated_value */
  estimatedValue: number | null;
  currency: string;
  score: number;
  isQualified: boolean;
  isVip: boolean;
  language: string | null;
  territory: string | null;
  department: string | null;
  /** CRM ownerId — persisted as assigned_user_id */
  assignedUserId: string | null;
  customerId: string | null;
  conversationId: string | null;
  qualifiedAt: string | null;
  convertedAt: string | null;
  archivedAt: string | null;
  expectedCloseDate: string | null;
  temperature: LeadTemperature | null;
  notes: string;
  tags: string[];
  lastActivityAt: string | null;
  aiSummary: string;
  metadata: Record<string, unknown>;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Unified CRM Lead contract (database → API → UI).
 * Prefer this shape at application and presentation boundaries.
 */
export type Lead = {
  id: string;
  name: string;
  companyName: string | null;
  contactPerson: string;
  email: string | null;
  phone: string | null;
  ownerId: string | null;
  owner: string | null;
  stageId: string;
  stage: string;
  sourceId: string | null;
  source: string | null;
  expectedValue: number | null;
  expectedCloseDate: string | null;
  priority: LeadPriority;
  temperature: LeadTemperature | null;
  tags: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string | null;
  tenantId: string;
  pipelineId: string;
  lifecycleStatus: LeadLifecycleStatus;
  currency: string;
  score: number;
  isQualified: boolean;
  customerId: string | null;
};

export function toLead(
  record: LeadRecord,
  opts?: {
    tenantId?: string;
    owner?: string | null;
    stage?: string | null;
    source?: string | null;
  },
): Lead {
  return {
    id: record.id,
    name: record.title,
    companyName: record.companyName,
    contactPerson: record.contactName,
    email: record.email,
    phone: record.phone,
    ownerId: record.assignedUserId,
    owner: opts?.owner ?? null,
    stageId: record.stageId,
    stage: opts?.stage ?? record.lifecycleStatus,
    sourceId: record.sourceId,
    source: opts?.source ?? null,
    expectedValue: record.estimatedValue,
    expectedCloseDate: record.expectedCloseDate,
    priority: record.priority,
    temperature: record.temperature,
    tags: record.tags ?? [],
    notes: record.notes ?? "",
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastActivityAt: record.lastActivityAt ?? record.updatedAt,
    tenantId: opts?.tenantId ?? record.companyId,
    pipelineId: record.pipelineId,
    lifecycleStatus: record.lifecycleStatus,
    currency: record.currency,
    score: record.score,
    isQualified: record.isQualified,
    customerId: record.customerId,
  };
}

export type LeadSummary = Pick<
  LeadRecord,
  | "id"
  | "title"
  | "contactName"
  | "email"
  | "phone"
  | "companyName"
  | "lifecycleStatus"
  | "priority"
  | "score"
  | "estimatedValue"
  | "currency"
  | "assignedUserId"
  | "pipelineId"
  | "stageId"
  | "sourceId"
  | "isQualified"
  | "customerId"
  | "expectedCloseDate"
  | "temperature"
  | "notes"
  | "tags"
  | "lastActivityAt"
  | "createdAt"
  | "updatedAt"
>;

export type LeadPipelineRecord = {
  id: string;
  companyId: string;
  name: string;
  slug: string;
  description: string;
  isDefault: boolean;
  isActive: boolean;
  /** Sprint 4.3 — when true, Kanban may move leads to earlier stages. Default true. */
  allowBackwardStageMovement: boolean;
};

export type LeadStageRecord = {
  id: string;
  companyId: string;
  pipelineId: string;
  name: string;
  slug: string;
  lifecycleStatus: LeadLifecycleStatus;
  sortOrder: number;
  probabilityPercent: number;
  isTerminal: boolean;
};

export type LeadSourceRecord = {
  id: string;
  companyId: string;
  name: string;
  slug: string;
  channelType: string | null;
  isActive: boolean;
};

export type LeadAssignmentRecord = {
  id: string;
  companyId: string;
  leadId: string;
  assignedUserId: string;
  assignmentMethod: AssignmentMethod;
  assignedBy: string | null;
  isActive: boolean;
  assignedAt: string;
};

export type LeadNoteRecord = {
  id: string;
  companyId: string;
  leadId: string;
  body: string;
  isInternal: boolean;
  createdBy: string | null;
  createdAt: string;
};

export type LeadTagRecord = {
  id: string;
  companyId: string;
  leadId: string;
  tag: string;
  createdAt: string;
};

export type LeadActivityRecord = {
  id: string;
  companyId: string;
  leadId: string;
  activityType: string;
  summary: string;
  payload: Record<string, unknown>;
  actorUserId: string | null;
  createdAt: string;
};

export type LeadHistoryRecord = {
  id: string;
  companyId: string;
  leadId: string;
  fieldName: string;
  previousValue: string | null;
  newValue: string | null;
  changeAction: string;
  actorUserId: string | null;
  createdAt: string;
};

export type LeadConversionRecord = {
  id: string;
  companyId: string;
  leadId: string;
  customerId: string;
  opportunityId: string | null;
  convertedBy: string | null;
  preservedPayload: Record<string, unknown>;
  createdAt: string;
};

export type LeadMetricsSnapshot = {
  totalLeads: number;
  leadsByStatus: Record<string, number>;
  pipelineMetrics: Array<{
    pipelineId: string;
    pipelineName: string;
    leadCount: number;
    pipelineValue: number;
  }>;
  conversionsInPeriod: number;
  createdInPeriod: number;
  forecastValue: number;
  conversionRate: number;
};

export type PipelineMetricsSnapshot = {
  pipelineId: string;
  pipelineName: string;
  stages: Array<{
    stageId: string;
    stageName: string;
    lifecycleStatus: LeadLifecycleStatus;
    leadCount: number;
    totalValue: number;
  }>;
};

export function toLeadSummary(record: LeadRecord): LeadSummary {
  return {
    id: record.id,
    title: record.title,
    contactName: record.contactName,
    email: record.email,
    phone: record.phone,
    companyName: record.companyName,
    lifecycleStatus: record.lifecycleStatus,
    priority: record.priority,
    score: record.score,
    estimatedValue: record.estimatedValue,
    currency: record.currency,
    assignedUserId: record.assignedUserId,
    pipelineId: record.pipelineId,
    stageId: record.stageId,
    sourceId: record.sourceId,
    isQualified: record.isQualified,
    customerId: record.customerId,
    expectedCloseDate: record.expectedCloseDate,
    temperature: record.temperature,
    notes: record.notes,
    tags: record.tags,
    lastActivityAt: record.lastActivityAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
