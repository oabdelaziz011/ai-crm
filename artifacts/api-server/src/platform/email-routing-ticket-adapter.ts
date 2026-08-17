import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyEmailRoutingTicketAction,
  type EmailRoutingTicketPort,
} from "@workspace/ai-intent-engine";
import type { EmailRoutingTicketActionPort } from "@workspace/channel-platform";
import { createTicketPlatformServices } from "@workspace/ticket-platform";

export type EmailRoutingTicketAdapterOptions = {
  resolveActorUserIdForCompany: (companyId: string) => Promise<string | null>;
};

function serviceContext(companyId: string, actorUserId: string) {
  return {
    userId: actorUserId,
    companyId,
    isSuperAdmin: true,
    hasPermission: () => true,
  };
}

/**
 * Adapts existing TicketCommandService / TicketReadPort for Sprint 5 AI Email Routing.
 * Reuses company-scoped create + assign; does not invent teams or bypass assignee resolution.
 */
export function createEmailRoutingTicketActionPort(
  client: SupabaseClient,
  options: EmailRoutingTicketAdapterOptions,
): EmailRoutingTicketActionPort {
  const platform = createTicketPlatformServices(client);

  async function resolveActor(companyId: string): Promise<string> {
    const actor = await options.resolveActorUserIdForCompany(companyId);
    if (!actor?.trim()) {
      throw new Error("An authenticated user is required for ticket operations.");
    }
    return actor.trim();
  }

  const ticketPort: EmailRoutingTicketPort = {
    async listByConversation(input) {
      const actorUserId = await resolveActor(input.companyId);
      const { tickets } = await platform.reads.listConversationTickets(
        serviceContext(input.companyId, actorUserId),
        {
          companyId: input.companyId,
          conversationId: input.conversationId,
        },
      );
      return tickets.map((ticket) => ({
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        assignedUserId: ticket.assignedUserId,
      }));
    },

    async createTicket(input) {
      const actorUserId = await resolveActor(input.companyId);
      const result = await platform.commands.createTicket(
        serviceContext(input.companyId, actorUserId),
        {
          companyId: input.companyId,
          subject: input.subject,
          description: input.description,
          conversationId: input.conversationId,
          metadata: input.metadata,
        },
      );
      return {
        id: result.ticket.id,
        ticketNumber: result.ticket.ticketNumber,
        assignedUserId: result.ticket.assignedUserId,
        metadata: input.metadata,
      };
    },

    async assignEmployee(input) {
      const actorUserId = await resolveActor(input.companyId);
      const result = await platform.commands.assignTicket(
        serviceContext(input.companyId, actorUserId),
        {
          companyId: input.companyId,
          ticketId: input.ticketId,
          assigneeUserId: input.assigneeUserId,
        },
      );
      return {
        id: result.ticket.id,
        ticketNumber: result.ticket.ticketNumber,
        assignedUserId: result.ticket.assignedUserId,
      };
    },
  };

  return {
    async apply(input) {
      const result = await applyEmailRoutingTicketAction(ticketPort, input);
      return {
        status: result.status,
        reason: result.reason,
        ticketId: result.ticketId,
        ticketNumber: result.status === "skipped" ? undefined : result.ticketNumber,
        assignedUserId: result.assignedUserId,
        targetType: result.status === "skipped" ? undefined : result.targetType,
        targetId: result.status === "skipped" ? undefined : result.targetId,
      };
    },
  };
}
