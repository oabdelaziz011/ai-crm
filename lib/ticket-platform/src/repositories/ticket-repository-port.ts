import type {
  TicketCommentRecord,
  TicketMetricsSnapshot,
  TicketPriority,
  TicketRecord,
  TicketSearchFilters,
  TicketStatus,
  CustomerTicketSnapshot,
} from "../types/ticket-types.js";

export type CreateTicketRepositoryInput = {
  companyId: string;
  ticketNumber: string;
  subject: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  customerId?: string | null;
  conversationId?: string | null;
  createdBy: string;
  slaDueAt: string;
  metadata?: Record<string, unknown>;
};

export type UpdateTicketRepositoryInput = {
  companyId: string;
  ticketId: string;
  updatedBy: string;
  subject?: string;
  description?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  assignedUserId?: string | null;
  closedAt?: string | null;
  closedBy?: string | null;
  reopenedAt?: string | null;
  reopenedBy?: string | null;
  firstResponseAt?: string | null;
  resolvedAt?: string | null;
  slaDueAt?: string | null;
  metadata?: Record<string, unknown>;
};

export type AddCommentRepositoryInput = {
  companyId: string;
  ticketId: string;
  body: string;
  isInternal: boolean;
  createdBy: string;
};

export interface TicketRepository {
  generateTicketNumber(companyId: string): Promise<string>;
  create(input: CreateTicketRepositoryInput): Promise<TicketRecord>;
  update(input: UpdateTicketRepositoryInput): Promise<TicketRecord>;
  softDelete(companyId: string, ticketId: string, deletedBy: string): Promise<TicketRecord>;
  findById(companyId: string, ticketId: string): Promise<TicketRecord | null>;
  search(filters: TicketSearchFilters): Promise<{ tickets: TicketRecord[]; total: number }>;
  listByCustomer(companyId: string, customerId: string, limit?: number): Promise<TicketRecord[]>;
  listByConversation(companyId: string, conversationId: string): Promise<TicketRecord[]>;
  countOpenByCustomer(companyId: string, customerId: string): Promise<number>;
  fetchCustomerSnapshot(companyId: string, customerId: string): Promise<CustomerTicketSnapshot>;
  fetchMetrics(companyId: string, todayStartIso: string): Promise<TicketMetricsSnapshot>;
}

export interface TicketCommentRepository {
  add(input: AddCommentRepositoryInput): Promise<TicketCommentRecord>;
  listByTicket(companyId: string, ticketId: string): Promise<TicketCommentRecord[]>;
}
