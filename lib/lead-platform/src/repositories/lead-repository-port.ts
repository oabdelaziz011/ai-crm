import type {
  AssignmentMethod,
  LeadActivityRecord,
  LeadAssignmentRecord,
  LeadHistoryRecord,
  LeadLifecycleStatus,
  LeadMetricsSnapshot,
  LeadNoteRecord,
  LeadPipelineRecord,
  LeadPriority,
  LeadRecord,
  LeadSourceRecord,
  LeadStageRecord,
  LeadSummary,
  LeadTagRecord,
  PipelineMetricsSnapshot,
} from "../types/lead-types.js";

export interface LeadRepository {
  ensureDefaultPipeline(companyId: string): Promise<string>;
  getDefaultStage(companyId: string, pipelineId: string): Promise<LeadStageRecord | null>;

  createLead(input: {
    companyId: string;
    pipelineId: string;
    stageId: string;
    sourceId?: string | null;
    lifecycleStatus: LeadLifecycleStatus;
    title: string;
    contactName?: string;
    email?: string | null;
    phone?: string | null;
    companyName?: string | null;
    priority?: LeadPriority;
    estimatedValue?: number | null;
    conversationId?: string | null;
    language?: string | null;
    territory?: string | null;
    department?: string | null;
    assignedUserId?: string | null;
    expectedCloseDate?: string | null;
    temperature?: "hot" | "warm" | "cold" | null;
    notes?: string;
    tags?: string[];
    lastActivityAt?: string | null;
    isVip?: boolean;
    aiSummary?: string;
    metadata?: Record<string, unknown>;
    /** ISO currency code from company billing settings when provided. */
    currency?: string | null;
    createdBy: string | null;
  }): Promise<LeadRecord>;

  updateLead(input: {
    companyId: string;
    leadId: string;
    updatedBy: string | null;
    title?: string;
    contactName?: string;
    email?: string | null;
    phone?: string | null;
    companyName?: string | null;
    priority?: LeadPriority;
    estimatedValue?: number | null;
    score?: number;
    isQualified?: boolean;
    lifecycleStatus?: LeadLifecycleStatus;
    stageId?: string;
    pipelineId?: string;
    sourceId?: string | null;
    assignedUserId?: string | null;
    customerId?: string | null;
    qualifiedAt?: string | null;
    convertedAt?: string | null;
    archivedAt?: string | null;
    expectedCloseDate?: string | null;
    temperature?: "hot" | "warm" | "cold" | null;
    notes?: string;
    tags?: string[];
    lastActivityAt?: string | null;
    aiSummary?: string;
    metadata?: Record<string, unknown>;
  }): Promise<LeadRecord>;

  softDeleteLead(companyId: string, leadId: string, updatedBy: string | null): Promise<void>;
  getLead(companyId: string, leadId: string): Promise<LeadRecord | null>;
  getLeadByConversation(companyId: string, conversationId: string): Promise<LeadRecord | null>;
  getLeadByCustomer(companyId: string, customerId: string): Promise<LeadRecord | null>;

  searchLeads(input: {
    companyId: string;
    query?: string;
    lifecycleStatus?: string;
    stageId?: string;
    pipelineId?: string;
    assignedUserId?: string;
    isQualified?: boolean;
    limit: number;
    offset: number;
  }): Promise<{ leads: LeadSummary[]; total: number }>;

  listPipelines(companyId: string): Promise<LeadPipelineRecord[]>;
  getPipeline(companyId: string, pipelineId: string): Promise<LeadPipelineRecord | null>;
  listStages(companyId: string, pipelineId: string): Promise<LeadStageRecord[]>;
  getStage(companyId: string, stageId: string): Promise<LeadStageRecord | null>;
  listSources(companyId: string): Promise<LeadSourceRecord[]>;
  ensureDefaultSources(companyId: string): Promise<LeadSourceRecord[]>;

  createAssignment(input: {
    companyId: string;
    leadId: string;
    assignedUserId: string;
    assignmentMethod: AssignmentMethod;
    assignedBy: string | null;
  }): Promise<LeadAssignmentRecord>;

  deactivateAssignments(companyId: string, leadId: string): Promise<void>;

  addNote(input: {
    companyId: string;
    leadId: string;
    body: string;
    isInternal: boolean;
    createdBy: string | null;
  }): Promise<LeadNoteRecord>;

  addTag(input: {
    companyId: string;
    leadId: string;
    tag: string;
    createdBy: string | null;
  }): Promise<LeadTagRecord>;

  removeTag(companyId: string, leadId: string, tag: string): Promise<void>;
  listTags(companyId: string, leadId: string): Promise<LeadTagRecord[]>;
  listNotes(companyId: string, leadId: string): Promise<LeadNoteRecord[]>;

  appendActivity(input: {
    companyId: string;
    leadId: string;
    activityType: string;
    summary: string;
    payload?: Record<string, unknown>;
    actorUserId: string | null;
  }): Promise<LeadActivityRecord>;

  appendHistory(input: {
    companyId: string;
    leadId: string;
    fieldName: string;
    previousValue: string | null;
    newValue: string | null;
    changeAction: string;
    actorUserId: string | null;
  }): Promise<LeadHistoryRecord>;

  listActivities(companyId: string, leadId: string, limit: number): Promise<LeadActivityRecord[]>;
  listHistory(companyId: string, leadId: string, limit: number): Promise<LeadHistoryRecord[]>;

  recordConversion(input: {
    companyId: string;
    leadId: string;
    customerId: string;
    opportunityId?: string | null;
    convertedBy: string | null;
    preservedPayload: Record<string, unknown>;
  }): Promise<void>;

  mergeLeads(input: {
    companyId: string;
    primaryLeadId: string;
    duplicateLeadIds: string[];
    updatedBy: string | null;
  }): Promise<LeadRecord>;

  fetchMetrics(companyId: string, periodStartIso: string): Promise<LeadMetricsSnapshot>;
  fetchPipelineMetrics(companyId: string, pipelineId: string): Promise<PipelineMetricsSnapshot>;
}
