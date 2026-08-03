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

export type LeadRecord = {
  id: string;
  companyId: string;
  pipelineId: string;
  stageId: string;
  sourceId: string | null;
  lifecycleStatus: LeadLifecycleStatus;
  title: string;
  contactName: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  priority: LeadPriority;
  estimatedValue: number | null;
  currency: string;
  score: number;
  isQualified: boolean;
  isVip: boolean;
  language: string | null;
  territory: string | null;
  department: string | null;
  assignedUserId: string | null;
  customerId: string | null;
  conversationId: string | null;
  qualifiedAt: string | null;
  convertedAt: string | null;
  archivedAt: string | null;
  aiSummary: string;
  metadata: Record<string, unknown>;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LeadSummary = Pick<
  LeadRecord,
  | "id"
  | "title"
  | "contactName"
  | "email"
  | "phone"
  | "lifecycleStatus"
  | "priority"
  | "score"
  | "estimatedValue"
  | "assignedUserId"
  | "pipelineId"
  | "stageId"
  | "isQualified"
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
    lifecycleStatus: record.lifecycleStatus,
    priority: record.priority,
    score: record.score,
    estimatedValue: record.estimatedValue,
    assignedUserId: record.assignedUserId,
    pipelineId: record.pipelineId,
    stageId: record.stageId,
    isQualified: record.isQualified,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
