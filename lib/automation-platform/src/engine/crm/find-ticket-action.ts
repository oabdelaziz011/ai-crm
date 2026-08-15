import { normalizeFindTicketConfig } from "../../crm/find-ticket-config.js";
import {
  buildActionVariableScope,
  resolveRequiredFieldBindingAsString,
} from "../../field-binding/resolver.js";
import { buildLookupStateFromStatus } from "../../crm/lookup/build-lookup-state.js";
import { buildLookupVariablePatch } from "../../crm/lookup/output-variables.js";
import type { TicketServicePort } from "../../ports/ticket-service-port.js";
import type { ExecutionContext, NodeExecutionResult } from "../execution-context.js";
import { mergeVariables } from "../execution-context.js";

function resolveActorUserId(context: ExecutionContext): string {
  const candidates = [
    context.run.metadata?.actorUserId,
    context.session.metadata?.actorUserId,
    context.variables.__actorUserId,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
}

function buildTicketEntityFields(ticket: {
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
} | null) {
  if (!ticket) {
    return {
      ticket: {
        exists: false,
        id: null,
        ticketNumber: null,
        ticket_number: null,
        subject: null,
        description: null,
        status: null,
        priority: null,
        customerId: null,
        conversationId: null,
        assignedUserId: null,
        assignedUserName: null,
        createdAt: null,
        updatedAt: null,
      },
      ticket_id: null,
      ticket_number: null,
      ticket_found: false,
    };
  }

  return {
    ticket: {
      exists: true,
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      ticket_number: ticket.ticketNumber,
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
    },
    ticket_id: ticket.id,
    ticket_number: ticket.ticketNumber,
    ticket_found: true,
  };
}

export async function executeFindTicketAction(
  context: ExecutionContext,
  config: Record<string, unknown>,
  ticketService: TicketServicePort,
): Promise<NodeExecutionResult> {
  const normalized = normalizeFindTicketConfig(config);
  const scope = buildActionVariableScope(context.variables, context.customer.id);
  const ticketNumber = resolveRequiredFieldBindingAsString(
    normalized.ticketNumber,
    scope,
    "ticket number",
  );

  const result = await ticketService.findTicket({
    companyId: context.company.id,
    actorUserId: resolveActorUserId(context),
    ticketNumber,
  });

  const lookupState = buildLookupStateFromStatus(result.status, result.status === "found" ? 1 : 0);
  const lookupPatch = buildLookupVariablePatch(lookupState);
  const ticketPatch = buildTicketEntityFields(result.ticket);

  return {
    outcome: "continue",
    variables: mergeVariables(context.variables, {
      ...lookupPatch,
      ...ticketPatch,
    }),
    output: {
      lookupStatus: lookupState.status,
      ticketFound: result.status === "found",
      ticket: result.ticket,
    },
  };
}
