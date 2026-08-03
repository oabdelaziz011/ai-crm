import type { TicketAgentToolPorts, TicketSummary } from "@workspace/ai-tool-router";
import type { TicketReadModel } from "@workspace/application-layer";
import type { LoginAppPortContext } from "./adapters/customer-read-port-adapter.js";
import {
  buildToolApplicationContext,
  createLoginAppApplicationServices,
  unwrapCommand,
  unwrapQuery,
} from "./application-layer-tool-context.js";

function mapTicket(ticket: TicketReadModel): TicketSummary {
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    subject: ticket.subject,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    customerId: ticket.customerId,
    conversationId: ticket.conversationId,
    assignedUserId: ticket.assignedUserId,
    assignedUserName: ticket.assignedUserName,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    closedAt: ticket.closedAt,
  };
}

/** Ticket AI tools — all operations route through TicketApplicationService. */
export function createApplicationLayerTicketToolPorts(portContext: LoginAppPortContext): TicketAgentToolPorts {
  const services = createLoginAppApplicationServices(portContext);

  return {
    async createTicket(input) {
      const ctx = buildToolApplicationContext(portContext, input.userId);
      const result = await services.ticket.createTicket(
        {
          subject: input.subject,
          description: input.description,
          priority: input.priority,
          customerId: input.customerId,
          conversationId: input.conversationId,
        },
        ctx,
      );
      const ticket = mapTicket(unwrapCommand(result));
      return { ticket };
    },
    async updateTicket(input) {
      const ctx = buildToolApplicationContext(portContext, input.userId);
      const result = await services.ticket.updateTicket(
        { ticketId: input.ticketId, subject: input.subject, description: input.description },
        ctx,
      );
      return { ticket: mapTicket(unwrapCommand(result)) };
    },
    async closeTicket(input) {
      const ctx = buildToolApplicationContext(portContext, input.userId);
      const result = await services.ticket.closeTicket(
        { ticketId: input.ticketId, resolutionNote: input.resolutionNote, status: input.status },
        ctx,
      );
      return { ticket: mapTicket(unwrapCommand(result)) };
    },
    async assignTicket(input) {
      const ctx = buildToolApplicationContext(portContext, input.userId);
      const result = await services.ticket.assignTicket(
        {
          ticketId: input.ticketId,
          assigneeUserId: input.assigneeUserId,
          assigneeName: input.assigneeName,
        },
        ctx,
      );
      return { ticket: mapTicket(unwrapCommand(result)) };
    },
    async addTicketComment(input) {
      const ctx = buildToolApplicationContext(portContext, input.userId);
      const result = await services.ticket.addTicketComment(
        { ticketId: input.ticketId, body: input.body, isInternal: input.isInternal },
        ctx,
      );
      return unwrapCommand(result);
    },
    async changeTicketPriority(input) {
      const ctx = buildToolApplicationContext(portContext, input.userId);
      const result = await services.ticket.changeTicketPriority(
        { ticketId: input.ticketId, priority: input.priority },
        ctx,
      );
      return { ticket: mapTicket(unwrapCommand(result)) };
    },
    async changeTicketStatus(input) {
      const ctx = buildToolApplicationContext(portContext, input.userId);
      const result = await services.ticket.changeTicketStatus(
        { ticketId: input.ticketId, status: input.status },
        ctx,
      );
      return { ticket: mapTicket(unwrapCommand(result)) };
    },
    async searchTickets(input) {
      const ctx = buildToolApplicationContext(portContext, input.userId);
      const result = await services.ticket.searchTickets(
        {
          query: input.query,
          status: input.status,
          priority: input.priority,
          assigneeName: input.assigneeName,
          customerId: input.customerId,
          limit: input.limit,
        },
        ctx,
      );
      const listed = unwrapQuery(result);
      return { tickets: listed.tickets.map(mapTicket), total: listed.total };
    },
  };
}
