import type {
  CustomerTicketSnapshot,
  TicketCommentRecord,
  TicketMetricsSnapshot,
  TicketServiceContext,
  TicketSummary,
} from "../types/ticket-types.js";

/** Normalized read authorization context for platform consumers. */
export type TicketReadAccessContext = TicketServiceContext;

export function toTicketServiceContext(access: TicketReadAccessContext): TicketServiceContext {
  return access;
}

export interface TicketReadPort {
  getTicket(
    access: TicketReadAccessContext,
    input: { companyId: string; ticketId: string },
  ): Promise<{ ticket: TicketSummary; comments: TicketCommentRecord[] }>;

  findByTicketNumber(
    access: TicketReadAccessContext,
    input: { companyId: string; ticketNumber: string },
  ): Promise<{ ticket: TicketSummary | null }>;

  searchTickets(
    access: TicketReadAccessContext,
    input: {
      companyId: string;
      query?: string;
      status?: string;
      priority?: string;
      customerId?: string;
      conversationId?: string;
      assignedUserId?: string;
      unassignedOnly?: boolean;
      assigneeName?: string;
      sortBy?: "updated_at" | "created_at" | "priority" | "status";
      sortDir?: "asc" | "desc";
      limit?: number;
      offset?: number;
    },
  ): Promise<{ tickets: TicketSummary[]; total: number }>;

  listCustomerTickets(
    access: TicketReadAccessContext,
    input: { companyId: string; customerId: string; limit?: number },
  ): Promise<{ tickets: TicketSummary[] }>;

  listConversationTickets(
    access: TicketReadAccessContext,
    input: { companyId: string; conversationId: string },
  ): Promise<{ tickets: TicketSummary[] }>;

  fetchCustomerSnapshot(
    access: TicketReadAccessContext,
    input: { companyId: string; customerId: string },
  ): Promise<CustomerTicketSnapshot>;

  fetchMetrics(
    access: TicketReadAccessContext,
    input: { companyId: string; todayStartIso: string },
  ): Promise<TicketMetricsSnapshot>;

  countOpenByCustomer(
    access: TicketReadAccessContext,
    input: { companyId: string; customerId: string },
  ): Promise<number>;
}
