import type { TICKET_PRIORITIES, TICKET_STATUSES } from "../constants.js";

export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export type TicketServiceContext = {
  userId: string | null;
  companyId: string | null;
  isSuperAdmin: boolean;
  hasPermission: (permissionCode: string) => boolean;
};

export type TicketRecord = {
  id: string;
  companyId: string;
  ticketNumber: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  customerId: string | null;
  conversationId: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  closedAt: string | null;
  closedBy: string | null;
  reopenedAt: string | null;
  reopenedBy: string | null;
  slaDueAt: string | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type TicketCommentRecord = {
  id: string;
  companyId: string;
  ticketId: string;
  body: string;
  isInternal: boolean;
  createdBy: string | null;
  createdAt: string;
};

export type TicketSummary = Pick<
  TicketRecord,
  | "id"
  | "ticketNumber"
  | "subject"
  | "description"
  | "status"
  | "priority"
  | "customerId"
  | "conversationId"
  | "assignedUserId"
  | "assignedUserName"
  | "createdAt"
  | "updatedAt"
  | "closedAt"
  | "slaDueAt"
  | "firstResponseAt"
  | "resolvedAt"
>;

export type TicketSearchFilters = {
  companyId: string;
  query?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  customerId?: string;
  conversationId?: string;
  assignedUserId?: string;
  /** When true, only tickets with no assignee (ignores assignedUserId). */
  unassignedOnly?: boolean;
  assigneeName?: string;
  sortBy?: "updated_at" | "created_at" | "priority" | "status";
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
};

export type TicketMetricsSnapshot = {
  totalTickets: number;
  openTickets: number;
  closedToday: number;
  unassignedTickets: number;
  highUrgentTickets: number;
  slaCompliancePercent: number;
  averageResponseMinutes: number;
  averageResolutionMinutes: number;
  slaBreaches: number;
  slaBreachesOpen: number;
  slaBreachesClosed: number;
  slaAtRiskOpen: number;
  ticketsByPriority: Record<string, number>;
  ticketsByStatus: Record<string, number>;
  ticketsByAgent: Array<{ agentId: string; agentName: string; count: number }>;
};

export type CustomerTicketSnapshot = {
  openTickets: TicketSummary[];
  closedTickets: TicketSummary[];
  lastTicket: TicketSummary | null;
  ticketCount: number;
};

export function toTicketSummary(record: TicketRecord): TicketSummary {
  return {
    id: record.id,
    ticketNumber: record.ticketNumber,
    subject: record.subject,
    description: record.description,
    status: record.status,
    priority: record.priority,
    customerId: record.customerId,
    conversationId: record.conversationId,
    assignedUserId: record.assignedUserId,
    assignedUserName: record.assignedUserName,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    closedAt: record.closedAt,
    slaDueAt: record.slaDueAt,
    firstResponseAt: record.firstResponseAt,
    resolvedAt: record.resolvedAt,
  };
}
