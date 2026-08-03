/** Lead workspace row — shared between table, kanban, and pipeline views. */
export type LeadWorkspaceRow = {
  id: string;
  tenantId: string;
  title: string;
  contactName: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  lifecycleStatus: string;
  stageId: string;
  stageName: string;
  pipelineId: string;
  priority: "low" | "normal" | "high" | "urgent";
  score: number;
  scoreBand: "cold" | "warm" | "hot";
  estimatedValue: number | null;
  currency: string;
  assignedUserId: string | null;
  ownerName: string | null;
  sourceName: string | null;
  tags: string[];
  isQualified: boolean;
  customerId: string | null;
  lastActivityAt: string | null;
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
  assignedUserId?: string;
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
