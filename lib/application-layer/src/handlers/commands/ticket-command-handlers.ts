import type { ApplicationContext } from "../../contracts/application-context.js";
import type { ApplicationPorts } from "../../ports/repository-ports.js";
import type { InfrastructurePorts } from "../../ports/infrastructure-ports.js";
import type {
  TicketCreateInput,
  TicketPriority,
  TicketStatus,
  TicketUpdateInput,
} from "../../ports/ticket-ports.js";

export type TicketCommandHandlerDeps = Readonly<{
  ports: ApplicationPorts;
  infra: InfrastructurePorts;
}>;

function eventContext(context: ApplicationContext) {
  return {
    tenantId: context.tenantId,
    workspaceId: context.workspaceId,
    actorId: context.actorId,
    actorType: context.actorType,
    correlationId: context.correlationId,
  };
}

export async function handleCreateTicket(
  deps: TicketCommandHandlerDeps,
  request: Omit<TicketCreateInput, "tenantId" | "actorUserId">,
  context: ApplicationContext,
) {
  const ticket = await deps.ports.ticketWrite.create({
    ...request,
    tenantId: context.tenantId,
    actorUserId: context.actorId,
  });
  return { response: ticket, eventIds: [] as string[] };
}

export async function handleUpdateTicket(
  deps: TicketCommandHandlerDeps,
  request: { ticketId: string; patch: Omit<TicketUpdateInput, "actorUserId"> },
  context: ApplicationContext,
) {
  const ticket = await deps.ports.ticketWrite.update(context.tenantId, request.ticketId, {
    ...request.patch,
    actorUserId: context.actorId,
  });
  return { response: ticket, eventIds: [] as string[] };
}

export async function handleCloseTicket(
  deps: TicketCommandHandlerDeps,
  request: { ticketId: string; resolutionNote?: string; status?: "resolved" | "closed" },
  context: ApplicationContext,
) {
  const ticket = await deps.ports.ticketWrite.close(context.tenantId, request.ticketId, {
    resolutionNote: request.resolutionNote,
    status: request.status,
    actorUserId: context.actorId,
  });
  return { response: ticket, eventIds: [] as string[] };
}

export async function handleAssignTicket(
  deps: TicketCommandHandlerDeps,
  request: { ticketId: string; assigneeUserId?: string; assigneeName?: string },
  context: ApplicationContext,
) {
  const ticket = await deps.ports.ticketWrite.assign(context.tenantId, request.ticketId, {
    assigneeUserId: request.assigneeUserId,
    assigneeName: request.assigneeName,
    actorUserId: context.actorId,
  });
  return { response: ticket, eventIds: [] as string[] };
}

export async function handleAddTicketComment(
  deps: TicketCommandHandlerDeps,
  request: { ticketId: string; body: string; isInternal?: boolean },
  context: ApplicationContext,
) {
  const result = await deps.ports.ticketWrite.addComment(context.tenantId, request.ticketId, {
    body: request.body,
    isInternal: request.isInternal,
    actorUserId: context.actorId,
  });
  return { response: result, eventIds: [] as string[] };
}

export async function handleChangeTicketPriority(
  deps: TicketCommandHandlerDeps,
  request: { ticketId: string; priority: TicketPriority },
  context: ApplicationContext,
) {
  const ticket = await deps.ports.ticketWrite.changePriority(context.tenantId, request.ticketId, {
    priority: request.priority,
    actorUserId: context.actorId,
  });
  return { response: ticket, eventIds: [] as string[] };
}

export async function handleChangeTicketStatus(
  deps: TicketCommandHandlerDeps,
  request: { ticketId: string; status: TicketStatus },
  context: ApplicationContext,
) {
  const ticket = await deps.ports.ticketWrite.changeStatus(context.tenantId, request.ticketId, {
    status: request.status,
    actorUserId: context.actorId,
  });
  return { response: ticket, eventIds: [] as string[] };
}
