import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabaseTicketAuditPort,
  createTicketPlatformServices,
  type TicketPlatformServices,
  type TicketServiceContext,
} from "@workspace/ticket-platform";
import type {
  TicketAgentToolPorts,
  TicketPriority,
  TicketStatus,
  TicketSummary,
} from "../tools/ticket-agent-ports.js";

export type CreateSupabaseTicketAgentToolPortsOptions = {
  platform?: TicketPlatformServices;
  resolveActorUserIdForCompany?: (companyId: string) => Promise<string | null>;
};

function buildToolContext(userId: string, companyId: string): TicketServiceContext {
  return {
    userId,
    companyId,
    isSuperAdmin: false,
    hasPermission: () => true,
  };
}

export function createTicketAgentToolPortsFromPlatform(
  platform: TicketPlatformServices,
): TicketAgentToolPorts {
  const { commands, queries } = platform;

  return {
    async getTicket(input) {
      try {
        const result = await queries.getTicket(buildToolContext(input.userId, input.companyId), {
          companyId: input.companyId,
          ticketId: input.ticketId,
        });
        return result.ticket ? { ticket: result.ticket as TicketSummary } : null;
      } catch {
        return null;
      }
    },

    async createTicket(input) {
      const result = await commands.createTicket(buildToolContext(input.userId, input.companyId), input);
      return { ticket: result.ticket as TicketSummary };
    },

    async updateTicket(input) {
      const result = await commands.updateTicket(buildToolContext(input.userId, input.companyId), input);
      return { ticket: result.ticket as TicketSummary };
    },

    async closeTicket(input) {
      const result = await commands.closeTicket(buildToolContext(input.userId, input.companyId), input);
      return { ticket: result.ticket as TicketSummary };
    },

    async assignTicket(input) {
      const result = await commands.assignTicket(buildToolContext(input.userId, input.companyId), input);
      return { ticket: result.ticket as TicketSummary };
    },

    async addTicketComment(input) {
      return commands.addComment(buildToolContext(input.userId, input.companyId), input);
    },

    async changeTicketPriority(input) {
      const result = await commands.changePriority(buildToolContext(input.userId, input.companyId), {
        ...input,
        priority: input.priority as TicketPriority,
      });
      return { ticket: result.ticket as TicketSummary };
    },

    async changeTicketStatus(input) {
      const result = await commands.changeStatus(buildToolContext(input.userId, input.companyId), {
        ...input,
        status: input.status as TicketStatus,
      });
      return { ticket: result.ticket as TicketSummary };
    },

    async searchTickets(input) {
      const result = await queries.searchTickets(buildToolContext(input.userId, input.companyId), {
        companyId: input.companyId,
        query: input.query,
        status: input.status as TicketStatus | undefined,
        priority: input.priority as TicketPriority | undefined,
        customerId: input.customerId,
        assigneeName: input.assigneeName,
        limit: input.limit,
      });
      return { tickets: result.tickets as TicketSummary[], total: result.total };
    },
  };
}

export function createSupabaseTicketAgentToolPorts(
  client: SupabaseClient,
  options: CreateSupabaseTicketAgentToolPortsOptions = {},
): TicketAgentToolPorts {
  const platform =
    options.platform ??
    createTicketPlatformServices(client, {
      audit: createSupabaseTicketAuditPort(client),
    });
  return createTicketAgentToolPortsFromPlatform(platform);
}
