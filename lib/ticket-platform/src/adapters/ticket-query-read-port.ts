import type { TicketReadPort } from "../ports/ticket-read-port.js";
import type { TicketQueryService } from "../services/ticket-query-service.js";
import type { TicketPriority, TicketStatus } from "../types/ticket-types.js";

export function createTicketReadPort(queries: TicketQueryService): TicketReadPort {
  return {
    getTicket(access, input) {
      return queries.getTicket(access, input);
    },

    searchTickets(access, input) {
      return queries.searchTickets(access, {
        companyId: input.companyId,
        query: input.query,
        status: input.status as TicketStatus | undefined,
        priority: input.priority as TicketPriority | undefined,
        customerId: input.customerId,
        conversationId: input.conversationId,
        assigneeName: input.assigneeName,
        limit: input.limit,
        offset: input.offset,
      });
    },

    listCustomerTickets(access, input) {
      return queries.listCustomerTickets(access, input);
    },

    listConversationTickets(access, input) {
      return queries.listConversationTickets(access, input);
    },

    fetchCustomerSnapshot(access, input) {
      return queries.fetchCustomerSnapshot(access, input);
    },

    fetchMetrics(access, input) {
      return queries.fetchMetrics(access, input);
    },

    countOpenByCustomer(access, input) {
      return queries.countOpenByCustomer(access, input);
    },
  };
}
