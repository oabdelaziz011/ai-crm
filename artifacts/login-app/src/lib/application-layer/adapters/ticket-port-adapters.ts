import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  TicketReadPort,
  TicketWritePort,
  TicketReadModel,
  TicketPriority,
  TicketStatus,
} from "@workspace/application-layer";
import { createLoginAppTicketPlatformServices } from "@/lib/ticket-platform/ticket-platform-factory";
import type { LoginAppPortContext } from "./customer-read-port-adapter.js";

function mapTicket(ticket: {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  customerId: string | null;
  conversationId: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}, tenantId: string): TicketReadModel {
  return Object.freeze({
    id: ticket.id,
    tenantId,
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
  });
}

function serviceContext(ctx: LoginAppPortContext, tenantId: string) {
  return {
    userId: ctx.actorUserId,
    companyId: tenantId,
    isSuperAdmin: ctx.isSuperAdmin,
    hasPermission: ctx.hasPermission,
  };
}

export function createLoginAppTicketReadPort(client: SupabaseClient, ctx: LoginAppPortContext): TicketReadPort {
  const platform = createLoginAppTicketPlatformServices(client);

  return {
    async getById(tenantId, ticketId) {
      if (tenantId !== ctx.companyId) return null;
      const result = await platform.queries.getTicket(serviceContext(ctx, tenantId), {
        companyId: tenantId,
        ticketId,
      });
      return result.ticket ? mapTicket(result.ticket as never, tenantId) : null;
    },
    async search(tenantId, filter) {
      if (tenantId !== ctx.companyId) return { tickets: [], total: 0 };
      const result = await platform.queries.searchTickets(serviceContext(ctx, tenantId), {
        companyId: tenantId,
        query: filter.query,
        status: filter.status,
        priority: filter.priority,
        assigneeName: filter.assigneeName,
        customerId: filter.customerId,
        limit: filter.limit ?? 20,
      });
      const tickets = result.tickets.map((t) => mapTicket(t as never, tenantId));
      return { tickets, total: result.total };
    },
  };
}

export function createLoginAppTicketWritePort(client: SupabaseClient, ctx: LoginAppPortContext): TicketWritePort {
  const platform = createLoginAppTicketPlatformServices(client);
  const sc = (tenantId: string) => serviceContext(ctx, tenantId);

  return {
    async create(input) {
      const result = await platform.commands.createTicket(sc(input.tenantId), {
        companyId: input.tenantId,
        subject: input.subject,
        description: input.description,
        priority: input.priority,
        customerId: input.customerId,
        conversationId: input.conversationId,
      });
      return mapTicket(result.ticket as never, input.tenantId);
    },
    async update(tenantId, ticketId, patch) {
      const result = await platform.commands.updateTicket(sc(tenantId), {
        companyId: tenantId,
        ticketId,
        subject: patch.subject,
        description: patch.description,
      });
      return mapTicket(result.ticket as never, tenantId);
    },
    async close(tenantId, ticketId, input) {
      const result = await platform.commands.closeTicket(sc(tenantId), {
        companyId: tenantId,
        ticketId,
        resolutionNote: input.resolutionNote,
        status: input.status,
      });
      return mapTicket(result.ticket as never, tenantId);
    },
    async assign(tenantId, ticketId, input) {
      const result = await platform.commands.assignTicket(sc(tenantId), {
        companyId: tenantId,
        ticketId,
        assigneeUserId: input.assigneeUserId,
        assigneeName: input.assigneeName,
      });
      return mapTicket(result.ticket as never, tenantId);
    },
    async addComment(tenantId, ticketId, input) {
      return platform.commands.addComment(sc(tenantId), {
        companyId: tenantId,
        ticketId,
        body: input.body,
        isInternal: input.isInternal,
      });
    },
    async changePriority(tenantId, ticketId, input) {
      const result = await platform.commands.changePriority(sc(tenantId), {
        companyId: tenantId,
        ticketId,
        priority: input.priority,
      });
      return mapTicket(result.ticket as never, tenantId);
    },
    async changeStatus(tenantId, ticketId, input) {
      const result = await platform.commands.changeStatus(sc(tenantId), {
        companyId: tenantId,
        ticketId,
        status: input.status,
      });
      return mapTicket(result.ticket as never, tenantId);
    },
  };
}
