import type { TICKET_DOMAIN_EVENTS } from "../constants.js";
import type { TicketCommentRecord, TicketRecord, TicketSummary } from "../types/ticket-types.js";

export type TicketDomainEventType = (typeof TICKET_DOMAIN_EVENTS)[number];

export type TicketDomainEventPayload = {
  ticketId: string;
  ticketNumber: string;
  companyId: string;
  actorUserId: string | null;
  ticket?: TicketSummary;
  previousStatus?: string;
  newStatus?: string;
  previousPriority?: string;
  newPriority?: string;
  assignedUserId?: string | null;
  commentId?: string;
  isInternal?: boolean;
  customerId?: string | null;
  conversationId?: string | null;
};

export type TicketDomainEvent = {
  type: TicketDomainEventType;
  companyId: string;
  ticketId: string;
  occurredAt: string;
  payload: TicketDomainEventPayload;
};

export function createTicketCreatedEvent(
  ticket: TicketRecord,
  actorUserId: string | null,
): TicketDomainEvent {
  return buildEvent("ticket_created", ticket, actorUserId);
}

export function createTicketUpdatedEvent(
  ticket: TicketRecord,
  actorUserId: string | null,
): TicketDomainEvent {
  return buildEvent("ticket_updated", ticket, actorUserId);
}

export function createTicketClosedEvent(
  ticket: TicketRecord,
  actorUserId: string | null,
): TicketDomainEvent {
  return buildEvent("ticket_closed", ticket, actorUserId, { newStatus: ticket.status });
}

export function createTicketReopenedEvent(
  ticket: TicketRecord,
  actorUserId: string | null,
  previousStatus: string,
): TicketDomainEvent {
  return buildEvent("ticket_reopened", ticket, actorUserId, {
    previousStatus,
    newStatus: ticket.status,
  });
}

export function createTicketAssignedEvent(
  ticket: TicketRecord,
  actorUserId: string | null,
  assignedUserId: string | null,
): TicketDomainEvent {
  return buildEvent("ticket_assigned", ticket, actorUserId, { assignedUserId });
}

export function createTicketCommentAddedEvent(
  ticket: TicketRecord,
  comment: TicketCommentRecord,
  actorUserId: string | null,
): TicketDomainEvent {
  return buildEvent("ticket_comment_added", ticket, actorUserId, {
    commentId: comment.id,
    isInternal: comment.isInternal,
  });
}

export function createTicketPriorityChangedEvent(
  ticket: TicketRecord,
  actorUserId: string | null,
  previousPriority: string,
): TicketDomainEvent {
  return buildEvent("ticket_priority_changed", ticket, actorUserId, {
    previousPriority,
    newPriority: ticket.priority,
  });
}

export function createTicketStatusChangedEvent(
  ticket: TicketRecord,
  actorUserId: string | null,
  previousStatus: string,
): TicketDomainEvent {
  return buildEvent("ticket_status_changed", ticket, actorUserId, {
    previousStatus,
    newStatus: ticket.status,
  });
}

export function createTicketDeletedEvent(
  ticket: TicketRecord,
  actorUserId: string | null,
): TicketDomainEvent {
  return buildEvent("ticket_deleted", ticket, actorUserId);
}

function buildEvent(
  type: TicketDomainEventType,
  ticket: TicketRecord,
  actorUserId: string | null,
  extra: Partial<TicketDomainEventPayload> = {},
): TicketDomainEvent {
  return {
    type,
    companyId: ticket.companyId,
    ticketId: ticket.id,
    occurredAt: new Date().toISOString(),
    payload: {
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      companyId: ticket.companyId,
      actorUserId,
      customerId: ticket.customerId,
      conversationId: ticket.conversationId,
      ticket: {
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
        slaDueAt: ticket.slaDueAt,
        firstResponseAt: ticket.firstResponseAt,
        resolvedAt: ticket.resolvedAt,
      },
      ...extra,
    },
  };
}
