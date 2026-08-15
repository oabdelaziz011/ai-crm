import { ValidationError } from "../../errors.js";
import { normalizeCreateTicketConfig } from "../../crm/create-ticket-config.js";
import {
  buildActionVariableScope,
  resolveFieldBindingAsString,
} from "../../field-binding/resolver.js";
import { isFieldBinding } from "../../field-binding/normalize.js";
import type { TicketServicePort } from "../../ports/ticket-service-port.js";
import type { ExecutionContext, NodeExecutionResult } from "../execution-context.js";
import { mergeVariables } from "../execution-context.js";
import { resolveInboxConversationId } from "../../runtime/resolve-inbox-conversation-id.js";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

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

function readVariableByKey(scope: Record<string, unknown>, key: string): string {
  const direct = scope[key];
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  if (!key) return "";
  return resolveFieldBindingAsString({ mode: "variable", variable: `{{${key}}}` }, scope);
}

function readCustomerId(scope: Record<string, unknown>, binding: unknown): string {
  if (isFieldBinding(binding)) {
    const fromBinding = resolveFieldBindingAsString(binding, scope).trim();
    if (fromBinding) return fromBinding;
  }

  const customer = scope.customer;
  if (customer && typeof customer === "object" && !Array.isArray(customer)) {
    const id = (customer as { id?: unknown }).id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return readVariableByKey(scope, "customer.id");
}

function resolveTicketField(
  binding: unknown,
  scope: Record<string, unknown>,
  fallback = "",
): string {
  if (!isFieldBinding(binding)) return fallback;
  const resolved = resolveFieldBindingAsString(binding, scope);
  return resolved || fallback;
}

export async function executeCreateTicketAction(
  context: ExecutionContext,
  config: Record<string, unknown>,
  ticketService: TicketServicePort,
): Promise<NodeExecutionResult> {
  const scope = buildActionVariableScope(context.variables, context.customer.id);
  const normalized = normalizeCreateTicketConfig(config);

  const subject = resolveTicketField(normalized.subject, scope);
  if (!subject) {
    throw new ValidationError("Create ticket requires a subject (static value or variable).");
  }

  const description = resolveTicketField(normalized.description, scope);
  const priority = resolveTicketField(normalized.priority, scope, "normal");
  const customerId = readCustomerId(scope, normalized.customer) || undefined;
  const conversationId = resolveInboxConversationId(context.variables) ?? undefined;
  const actorUserId = resolveActorUserId(context);

  const { ticket } = await ticketService.createTicket({
    companyId: context.company.id,
    actorUserId,
    subject,
    description: description || undefined,
    priority,
    customerId,
    conversationId,
  });

  return {
    outcome: "continue",
    variables: mergeVariables(context.variables, {
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        number: ticket.ticketNumber,
        subject: ticket.subject,
        status: ticket.status,
        priority: ticket.priority,
        assignedUserId: ticket.assignedUserId,
        assignedUserName: ticket.assignedUserName,
        customerId: ticket.customerId,
        conversationId: ticket.conversationId,
      },
      ticket_id: ticket.id,
      ticket_number: ticket.ticketNumber,
    }),
    output: { ticket },
  };
}

export async function executeAssignTicketAction(
  context: ExecutionContext,
  config: Record<string, unknown>,
  ticketService: TicketServicePort,
): Promise<NodeExecutionResult> {
  const scope = buildActionVariableScope(context.variables, context.customer.id);
  const ticketIdField = readString(config.ticketIdField) ?? "ticket_id";
  const assigneeUserIdField = readString(config.assigneeUserIdField);
  const assigneeNameField = readString(config.assigneeNameField);
  const staticTicketId = readString(config.ticketId);
  const staticAssigneeUserId = readString(config.assigneeUserId);
  const staticAssigneeName = readString(config.assigneeName);

  const ticketFromVars =
    scope.ticket && typeof scope.ticket === "object" && !Array.isArray(scope.ticket)
      ? String((scope.ticket as { id?: unknown }).id ?? "").trim()
      : "";

  const ticketId =
    staticTicketId || ticketFromVars || readVariableByKey(scope, ticketIdField);
  if (!ticketId) {
    throw new ValidationError(`Assign ticket requires ${ticketIdField} or ticket.id.`);
  }

  const assigneeUserId =
    staticAssigneeUserId ||
    (assigneeUserIdField ? readVariableByKey(scope, assigneeUserIdField) : "") ||
    undefined;
  const assigneeName =
    staticAssigneeName ||
    (assigneeNameField ? readVariableByKey(scope, assigneeNameField) : "") ||
    undefined;

  if (!assigneeUserId && !assigneeName) {
    throw new ValidationError("Assign ticket requires assigneeUserId or assigneeName.");
  }

  const { ticket } = await ticketService.assignTicket({
    companyId: context.company.id,
    actorUserId: resolveActorUserId(context),
    ticketId,
    assigneeUserId,
    assigneeName,
  });

  return {
    outcome: "continue",
    variables: mergeVariables(context.variables, {
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        status: ticket.status,
        priority: ticket.priority,
        assignedUserId: ticket.assignedUserId,
        assignedUserName: ticket.assignedUserName,
        customerId: ticket.customerId,
        conversationId: ticket.conversationId,
      },
      ticket_id: ticket.id,
      ticket_number: ticket.ticketNumber,
    }),
    output: { ticket },
  };
}
