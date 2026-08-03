import type { TicketQueryService } from "../services/ticket-query-service.js";
import type { TicketCommentRecord } from "../types/ticket-types.js";
import type { TicketServiceContext, TicketSummary } from "../types/ticket-types.js";
import type { TicketSearchFilters } from "../types/ticket-types.js";

export type GetTicketInput = {
  companyId: string;
  ticketId: string;
};

export function executeGetTicket(
  service: TicketQueryService,
  ctx: TicketServiceContext,
  input: GetTicketInput,
): Promise<{ ticket: TicketSummary; comments: TicketCommentRecord[] }> {
  return service.getTicket(ctx, input);
}

export type ListCustomerTicketsInput = {
  companyId: string;
  customerId: string;
  limit?: number;
};

export function executeListCustomerTickets(
  service: TicketQueryService,
  ctx: TicketServiceContext,
  input: ListCustomerTicketsInput,
): Promise<{ tickets: TicketSummary[] }> {
  return service.listCustomerTickets(ctx, input);
}

export type SearchTicketsInput = Omit<TicketSearchFilters, "limit" | "offset"> & {
  limit?: number;
  offset?: number;
};

export function executeSearchTickets(
  service: TicketQueryService,
  ctx: TicketServiceContext,
  input: SearchTicketsInput,
): Promise<{ tickets: TicketSummary[]; total: number }> {
  return service.searchTickets(ctx, input);
}

export type ListConversationTicketsInput = {
  companyId: string;
  conversationId: string;
};

export function executeListConversationTickets(
  service: TicketQueryService,
  ctx: TicketServiceContext,
  input: ListConversationTicketsInput,
): Promise<{ tickets: TicketSummary[] }> {
  return service.listConversationTickets(ctx, input);
}
