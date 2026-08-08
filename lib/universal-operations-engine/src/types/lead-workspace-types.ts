/** Canonical CRM Lead workspace row — one model for table, kanban, Lead360 list context. */
export type LeadWorkspaceRow = {
  id: string;
  tenantId: string;
  name: string;
  contactPerson: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  ownerId: string | null;
  owner: string | null;
  stageId: string;
  stage: string;
  sourceId: string | null;
  source: string | null;
  expectedValue: number | null;
  expectedCloseDate: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  temperature: "hot" | "warm" | "cold" | null;
  tags: string[];
  notes: string;
  lastActivityAt: string | null;
  lifecycleStatus: string;
  pipelineId: string;
  currency: string;
  score: number;
  scoreBand: "cold" | "warm" | "hot";
  isQualified: boolean;
  customerId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LeadWorkspacePage = {
  rows: LeadWorkspaceRow[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export type LeadWorkspaceQuery = {
  tenantId: string;
  page: number;
  pageSize: number;
  search?: string;
  stageId?: string;
  pipelineId?: string;
  ownerId?: string;
  lifecycleStatus?: string;
  priority?: string;
  scoreBand?: "cold" | "warm" | "hot";
  tag?: string;
  sort?: Array<{ columnId: string; direction: "asc" | "desc" }>;
};

export type LeadKanbanColumn = {
  stageId: string;
  stageName: string;
  lifecycleStatus: string;
  sortOrder: number;
  leadCount: number;
  totalValue: number;
  leads: LeadWorkspaceRow[];
};

export type LeadKanbanBoard = {
  pipelineId: string;
  pipelineName: string;
  columns: LeadKanbanColumn[];
};

export function resolveScoreBand(score: number): "cold" | "warm" | "hot" {
  if (score >= 70) return "hot";
  if (score >= 40) return "warm";
  return "cold";
}
