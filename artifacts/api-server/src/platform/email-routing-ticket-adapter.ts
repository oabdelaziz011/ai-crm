import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyEmailRoutingTicketAction,
  type EmailRoutingTicketPort,
} from "@workspace/ai-intent-engine";
import type { EmailRoutingTicketActionPort } from "@workspace/channel-platform";
import { createTicketPlatformServices, TICKET_PERMISSIONS } from "@workspace/ticket-platform";

export type EmailRoutingTicketAdapterOptions = {
  resolveActorUserIdForCompany: (companyId: string) => Promise<string | null>;
};

/** Narrow permissions used by AI Email Routing ticket create/reuse/assign only. */
export const EMAIL_ROUTING_TICKET_PERMISSIONS: ReadonlySet<string> = new Set([
  TICKET_PERMISSIONS.view,
  TICKET_PERMISSIONS.create,
  TICKET_PERMISSIONS.assign,
]);

export type EmailRoutingTicketServiceContext = {
  userId: string;
  companyId: string;
  isSuperAdmin: false;
  hasPermission: (permissionCode: string) => boolean;
};

/**
 * Company-scoped machine context for email-routing → ticket bridge.
 * Never fabricates isSuperAdmin / hasPermission allow-all.
 * Actor is the resolved company technical user (existing resolveCompanyActorUserId path).
 */
export function buildEmailRoutingTicketServiceContext(
  companyId: string | null | undefined,
  actorUserId: string | null | undefined,
): EmailRoutingTicketServiceContext {
  const scopedCompany = typeof companyId === "string" ? companyId.trim() : "";
  const scopedActor = typeof actorUserId === "string" ? actorUserId.trim() : "";
  if (!scopedCompany) {
    throw new Error("Company context is required for email routing ticket operations.");
  }
  if (!scopedActor) {
    throw new Error("An authenticated user is required for ticket operations.");
  }

  return {
    userId: scopedActor,
    companyId: scopedCompany,
    isSuperAdmin: false,
    hasPermission(permissionCode: string): boolean {
      return EMAIL_ROUTING_TICKET_PERMISSIONS.has(permissionCode.trim());
    },
  };
}

/**
 * Adapts existing TicketCommandService / TicketReadPort for Sprint 5 AI Email Routing.
 * Reuses company-scoped create + assign; does not invent teams or bypass assignee resolution.
 * Commercial email-routing entitlement remains upstream (inbound pipeline).
 */
export function createEmailRoutingTicketActionPort(
  client: SupabaseClient,
  options: EmailRoutingTicketAdapterOptions,
): EmailRoutingTicketActionPort {
  const platform = createTicketPlatformServices(client);

  async function resolveActor(companyId: string): Promise<string> {
    const scopedCompany = companyId?.trim() ?? "";
    if (!scopedCompany) {
      throw new Error("Company context is required for email routing ticket operations.");
    }
    const actor = await options.resolveActorUserIdForCompany(scopedCompany);
    if (!actor?.trim()) {
      throw new Error("An authenticated user is required for ticket operations.");
    }
    return actor.trim();
  }

  const ticketPort: EmailRoutingTicketPort = {
    async listByConversation(input) {
      const actorUserId = await resolveActor(input.companyId);
      const ctx = buildEmailRoutingTicketServiceContext(input.companyId, actorUserId);
      const { tickets } = await platform.reads.listConversationTickets(ctx, {
        companyId: ctx.companyId,
        conversationId: input.conversationId,
      });
      return tickets.map((ticket) => ({
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        assignedUserId: ticket.assignedUserId,
      }));
    },

    async createTicket(input) {
      const actorUserId = await resolveActor(input.companyId);
      const ctx = buildEmailRoutingTicketServiceContext(input.companyId, actorUserId);
      const result = await platform.commands.createTicket(ctx, {
        companyId: ctx.companyId,
        subject: input.subject,
        description: input.description,
        conversationId: input.conversationId,
        metadata: input.metadata,
      });
      return {
        id: result.ticket.id,
        ticketNumber: result.ticket.ticketNumber,
        assignedUserId: result.ticket.assignedUserId,
        metadata: input.metadata,
      };
    },

    async assignEmployee(input) {
      const actorUserId = await resolveActor(input.companyId);
      const ctx = buildEmailRoutingTicketServiceContext(input.companyId, actorUserId);
      const result = await platform.commands.assignTicket(ctx, {
        companyId: ctx.companyId,
        ticketId: input.ticketId,
        assigneeUserId: input.assigneeUserId,
      });
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
