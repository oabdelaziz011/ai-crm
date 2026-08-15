import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AssignAutomationTicketInput,
  CreateAutomationTicketInput,
  FindAutomationTicketInput,
  TicketServicePort,
} from "@workspace/automation-platform";
import { createLoginAppTicketPlatformServices } from "@/lib/ticket-platform/ticket-platform-factory";

function mapTicket(ticket: {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  customerId: string | null;
  conversationId: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  createdAt: string;
  updatedAt: string;
}) {
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
  };
}

function serviceContext(companyId: string, actorUserId: string) {
  return {
    userId: actorUserId || null,
    companyId,
    isSuperAdmin: true,
    hasPermission: () => true,
  };
}

export type AutomationTicketServicePortOptions = {
  /** Used on WhatsApp/webhook automations when no human actor is present. */
  resolveActorUserIdForCompany?: (companyId: string) => Promise<string | null>;
};

async function resolveActorUserId(
  companyId: string,
  actorUserId: string,
  options?: AutomationTicketServicePortOptions,
): Promise<string> {
  const explicit = actorUserId.trim();
  if (explicit) return explicit;
  const resolved = options?.resolveActorUserIdForCompany
    ? await options.resolveActorUserIdForCompany(companyId)
    : null;
  if (resolved?.trim()) return resolved.trim();
  throw new Error("An authenticated user is required for ticket operations.");
}

/**
 * Workflow/runtime ticket mutations for channel automations.
 * Uses login-app platform factory so domain events / notifications / audit stay wired
 * (same path as the Ticketing UI — no second ticket engine).
 */
export function createAutomationTicketServicePort(
  client: SupabaseClient,
  options?: AutomationTicketServicePortOptions,
): TicketServicePort {
  const platform = createLoginAppTicketPlatformServices(client);

  return {
    async createTicket(input: CreateAutomationTicketInput) {
      const actorUserId = await resolveActorUserId(input.companyId, input.actorUserId, options);
      const result = await platform.commands.createTicket(serviceContext(input.companyId, actorUserId), {
        companyId: input.companyId,
        subject: input.subject,
        description: input.description,
        priority: input.priority as never,
        customerId: input.customerId,
        conversationId: input.conversationId,
      });
      return { ticket: mapTicket(result.ticket) };
    },
    async assignTicket(input: AssignAutomationTicketInput) {
      const actorUserId = await resolveActorUserId(input.companyId, input.actorUserId, options);
      const result = await platform.commands.assignTicket(serviceContext(input.companyId, actorUserId), {
        companyId: input.companyId,
        ticketId: input.ticketId,
        assigneeUserId: input.assigneeUserId,
        assigneeName: input.assigneeName,
      });
      return { ticket: mapTicket(result.ticket) };
    },
    async findTicket(input: FindAutomationTicketInput) {
      const actorUserId = await resolveActorUserId(input.companyId, input.actorUserId, options);
      const result = await platform.reads.findByTicketNumber(serviceContext(input.companyId, actorUserId), {
        companyId: input.companyId,
        ticketNumber: input.ticketNumber,
      });
      if (!result.ticket) {
        return { status: "not_found", ticket: null };
      }
      return { status: "found", ticket: mapTicket(result.ticket) };
    },
  };
}
