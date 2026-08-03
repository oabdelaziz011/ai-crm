import { TICKET_PERMISSIONS } from "../constants.js";
import {
  createTicketAssignedEvent,
  createTicketClosedEvent,
  createTicketCommentAddedEvent,
  createTicketCreatedEvent,
  createTicketDeletedEvent,
  createTicketPriorityChangedEvent,
  createTicketReopenedEvent,
  createTicketStatusChangedEvent,
  createTicketUpdatedEvent,
} from "../events/ticket-event-factory.js";
import { TicketNotFoundError } from "../errors.js";
import type {
  TicketAssigneeResolverPort,
  TicketAuditPort,
  TicketEventPublisherPort,
  TicketNotificationPort,
} from "../ports/ticket-platform-ports.js";
import type { TicketCommentRepository, TicketRepository } from "../repositories/ticket-repository-port.js";
import { computeSlaDueAt, isSlaBreached, isSlaWarning } from "./ticket-sla-service.js";
import type { TicketPriority, TicketServiceContext, TicketStatus, TicketSummary } from "../types/ticket-types.js";
import { toTicketSummary } from "../types/ticket-types.js";
import {
  assertStatusTransition,
  isReopenTransition,
  isTerminalStatus,
} from "../validators/status-transition-validator.js";
import {
  assertTicketActor,
  assertTicketCompanyAccess,
  assertTicketManageOrEdit,
  assertTicketPermission,
} from "../validators/ticket-guards.js";
import { readOptionalString, readPriority, readRequiredString, readStatus } from "../validators/ticket-validators.js";

export type TicketCommandServiceDeps = {
  tickets: TicketRepository;
  comments: TicketCommentRepository;
  assignees: TicketAssigneeResolverPort;
  events: TicketEventPublisherPort;
  notifications: TicketNotificationPort;
  audit: TicketAuditPort;
};

export class TicketCommandService {
  constructor(private readonly deps: TicketCommandServiceDeps) {}

  async createTicket(
    ctx: TicketServiceContext,
    input: {
      companyId: string;
      subject: string;
      description?: string;
      priority?: TicketPriority;
      customerId?: string;
      conversationId?: string;
    },
  ): Promise<{ ticket: TicketSummary }> {
    const actorUserId = assertTicketActor(ctx);
    assertTicketCompanyAccess(ctx, input.companyId);
    assertTicketPermission(ctx, TICKET_PERMISSIONS.create);

    const subject = readRequiredString(input.subject, "Subject");
    const priority = readPriority(input.priority);
    const ticketNumber = await this.deps.tickets.generateTicketNumber(input.companyId);
    const slaDueAt = computeSlaDueAt(priority);

    const record = await this.deps.tickets.create({
      companyId: input.companyId,
      ticketNumber,
      subject,
      description: readOptionalString(input.description) ?? "",
      priority,
      status: "open",
      customerId: readOptionalString(input.customerId) ?? null,
      conversationId: readOptionalString(input.conversationId) ?? null,
      createdBy: actorUserId,
      slaDueAt,
    });

    await this.writeAudit(input.companyId, actorUserId, "CREATE", "support_ticket", record.id, {
      ticketNumber: record.ticketNumber,
      priority: record.priority,
    });

    await this.deps.events.publish(createTicketCreatedEvent(record, actorUserId));
    await this.checkSlaNotifications(record, actorUserId);

    return { ticket: toTicketSummary(record) };
  }

  async updateTicket(
    ctx: TicketServiceContext,
    input: { companyId: string; ticketId: string; subject?: string; description?: string },
  ): Promise<{ ticket: TicketSummary }> {
    const actorUserId = assertTicketActor(ctx);
    assertTicketCompanyAccess(ctx, input.companyId);
    assertTicketPermission(ctx, TICKET_PERMISSIONS.edit);

    const existing = await this.requireTicket(input.companyId, input.ticketId);
    const record = await this.deps.tickets.update({
      companyId: input.companyId,
      ticketId: input.ticketId,
      updatedBy: actorUserId,
      subject: input.subject != null ? readRequiredString(input.subject, "Subject") : undefined,
      description: input.description != null ? String(input.description) : undefined,
    });

    await this.writeAudit(input.companyId, actorUserId, "UPDATE", "support_ticket", input.ticketId, {
      patch: { subject: input.subject, description: input.description },
    });

    await this.deps.events.publish(createTicketUpdatedEvent(record, actorUserId));
    return { ticket: toTicketSummary(record) };
  }

  async closeTicket(
    ctx: TicketServiceContext,
    input: {
      companyId: string;
      ticketId: string;
      resolutionNote?: string;
      status?: "resolved" | "closed";
    },
  ): Promise<{ ticket: TicketSummary }> {
    const actorUserId = assertTicketActor(ctx);
    assertTicketCompanyAccess(ctx, input.companyId);
    assertTicketPermission(ctx, TICKET_PERMISSIONS.close);

    const existing = await this.requireTicket(input.companyId, input.ticketId);
    const status = input.status ?? "closed";
    assertStatusTransition(existing.status, status);

    const now = new Date().toISOString();
    const record = await this.deps.tickets.update({
      companyId: input.companyId,
      ticketId: input.ticketId,
      updatedBy: actorUserId,
      status,
      closedAt: now,
      closedBy: actorUserId,
      resolvedAt: now,
    });

    if (input.resolutionNote?.trim()) {
      await this.deps.comments.add({
        companyId: input.companyId,
        ticketId: input.ticketId,
        body: input.resolutionNote.trim(),
        isInternal: false,
        createdBy: actorUserId,
      });
    }

    await this.writeAudit(input.companyId, actorUserId, "UPDATE", "support_ticket", input.ticketId, {
      action: "close",
      status,
    });

    await this.deps.events.publish(createTicketClosedEvent(record, actorUserId));
    await this.deps.events.publish(
      createTicketStatusChangedEvent(record, actorUserId, existing.status),
    );
    await this.deps.notifications.notify({
      kind: "close",
      companyId: input.companyId,
      ticketId: record.id,
      ticketNumber: record.ticketNumber,
      subject: record.subject,
      actorUserId,
      recipientUserId: record.assignedUserId,
      customerId: record.customerId,
      conversationId: record.conversationId,
    });

    return { ticket: toTicketSummary(record) };
  }

  async reopenTicket(
    ctx: TicketServiceContext,
    input: { companyId: string; ticketId: string; reason?: string },
  ): Promise<{ ticket: TicketSummary }> {
    const actorUserId = assertTicketActor(ctx);
    assertTicketCompanyAccess(ctx, input.companyId);
    assertTicketManageOrEdit(ctx, TICKET_PERMISSIONS.edit);

    const existing = await this.requireTicket(input.companyId, input.ticketId);
    if (!isTerminalStatus(existing.status)) {
      assertStatusTransition(existing.status, "open");
    }

    const now = new Date().toISOString();
    const record = await this.deps.tickets.update({
      companyId: input.companyId,
      ticketId: input.ticketId,
      updatedBy: actorUserId,
      status: "open",
      closedAt: null,
      closedBy: null,
      resolvedAt: null,
      reopenedAt: now,
      reopenedBy: actorUserId,
      slaDueAt: computeSlaDueAt(existing.priority),
    });

    if (input.reason?.trim()) {
      await this.deps.comments.add({
        companyId: input.companyId,
        ticketId: input.ticketId,
        body: input.reason.trim(),
        isInternal: true,
        createdBy: actorUserId,
      });
    }

    await this.writeAudit(input.companyId, actorUserId, "UPDATE", "support_ticket", input.ticketId, {
      action: "reopen",
    });

    await this.deps.events.publish(createTicketReopenedEvent(record, actorUserId, existing.status));
    await this.deps.events.publish(
      createTicketStatusChangedEvent(record, actorUserId, existing.status),
    );
    await this.deps.notifications.notify({
      kind: "status_change",
      companyId: input.companyId,
      ticketId: record.id,
      ticketNumber: record.ticketNumber,
      subject: record.subject,
      actorUserId,
      recipientUserId: record.assignedUserId,
      customerId: record.customerId,
      conversationId: record.conversationId,
      metadata: { previousStatus: existing.status, newStatus: "open" },
    });

    return { ticket: toTicketSummary(record) };
  }

  async deleteTicket(
    ctx: TicketServiceContext,
    input: { companyId: string; ticketId: string },
  ): Promise<{ ticketId: string }> {
    const actorUserId = assertTicketActor(ctx);
    assertTicketCompanyAccess(ctx, input.companyId);
    assertTicketPermission(ctx, TICKET_PERMISSIONS.manage);

    const existing = await this.requireTicket(input.companyId, input.ticketId);
    await this.deps.tickets.softDelete(input.companyId, input.ticketId, actorUserId);

    await this.writeAudit(input.companyId, actorUserId, "DELETE", "support_ticket", input.ticketId, {});
    await this.deps.events.publish(createTicketDeletedEvent(existing, actorUserId));

    return { ticketId: input.ticketId };
  }

  async assignTicket(
    ctx: TicketServiceContext,
    input: {
      companyId: string;
      ticketId: string;
      assigneeUserId?: string;
      assigneeName?: string;
    },
  ): Promise<{ ticket: TicketSummary }> {
    const actorUserId = assertTicketActor(ctx);
    assertTicketCompanyAccess(ctx, input.companyId);
    assertTicketPermission(ctx, TICKET_PERMISSIONS.assign);

    await this.requireTicket(input.companyId, input.ticketId);
    const assigneeId = await this.deps.assignees.resolveAssigneeUserId({
      companyId: input.companyId,
      assigneeUserId: input.assigneeUserId,
      assigneeName: input.assigneeName,
    });

    const record = await this.deps.tickets.update({
      companyId: input.companyId,
      ticketId: input.ticketId,
      updatedBy: actorUserId,
      assignedUserId: assigneeId,
      status: "in_progress",
    });

    const names = await this.deps.assignees.loadAssigneeNames([assigneeId]);
    record.assignedUserName = names.get(assigneeId) ?? null;

    await this.writeAudit(input.companyId, actorUserId, "UPDATE", "support_ticket", input.ticketId, {
      assignedUserId: assigneeId,
    });

    await this.deps.events.publish(createTicketAssignedEvent(record, actorUserId, assigneeId));
    await this.deps.notifications.notify({
      kind: "assignment",
      companyId: input.companyId,
      ticketId: record.id,
      ticketNumber: record.ticketNumber,
      subject: record.subject,
      actorUserId,
      recipientUserId: assigneeId,
      customerId: record.customerId,
      conversationId: record.conversationId,
    });

    return { ticket: toTicketSummary(record) };
  }

  async unassignTicket(
    ctx: TicketServiceContext,
    input: { companyId: string; ticketId: string },
  ): Promise<{ ticket: TicketSummary }> {
    const actorUserId = assertTicketActor(ctx);
    assertTicketCompanyAccess(ctx, input.companyId);
    assertTicketPermission(ctx, TICKET_PERMISSIONS.assign);

    const existing = await this.requireTicket(input.companyId, input.ticketId);
    const record = await this.deps.tickets.update({
      companyId: input.companyId,
      ticketId: input.ticketId,
      updatedBy: actorUserId,
      assignedUserId: null,
      status: existing.status === "in_progress" ? "open" : existing.status,
    });

    await this.writeAudit(input.companyId, actorUserId, "UPDATE", "support_ticket", input.ticketId, {
      action: "unassign",
    });

    await this.deps.events.publish(createTicketAssignedEvent(record, actorUserId, null));
    return { ticket: toTicketSummary(record) };
  }

  async changePriority(
    ctx: TicketServiceContext,
    input: { companyId: string; ticketId: string; priority: TicketPriority },
  ): Promise<{ ticket: TicketSummary }> {
    const actorUserId = assertTicketActor(ctx);
    assertTicketCompanyAccess(ctx, input.companyId);
    assertTicketPermission(ctx, TICKET_PERMISSIONS.edit);

    const existing = await this.requireTicket(input.companyId, input.ticketId);
    const priority = readPriority(input.priority, existing.priority);

    const record = await this.deps.tickets.update({
      companyId: input.companyId,
      ticketId: input.ticketId,
      updatedBy: actorUserId,
      priority,
      slaDueAt: computeSlaDueAt(priority),
    });

    await this.writeAudit(input.companyId, actorUserId, "UPDATE", "support_ticket", input.ticketId, {
      priority,
    });

    await this.deps.events.publish(createTicketPriorityChangedEvent(record, actorUserId, existing.priority));
    await this.deps.notifications.notify({
      kind: "priority_change",
      companyId: input.companyId,
      ticketId: record.id,
      ticketNumber: record.ticketNumber,
      subject: record.subject,
      actorUserId,
      recipientUserId: record.assignedUserId,
      customerId: record.customerId,
      conversationId: record.conversationId,
      metadata: { previousPriority: existing.priority, newPriority: priority },
    });
    await this.checkSlaNotifications(record, actorUserId);

    return { ticket: toTicketSummary(record) };
  }

  async changeStatus(
    ctx: TicketServiceContext,
    input: { companyId: string; ticketId: string; status: TicketStatus },
  ): Promise<{ ticket: TicketSummary }> {
    const actorUserId = assertTicketActor(ctx);
    assertTicketCompanyAccess(ctx, input.companyId);
    assertTicketPermission(ctx, TICKET_PERMISSIONS.edit);

    const existing = await this.requireTicket(input.companyId, input.ticketId);
    const status = readStatus(input.status);

    if (isReopenTransition(existing.status, status)) {
      return this.reopenTicket(ctx, { companyId: input.companyId, ticketId: input.ticketId });
    }

    assertStatusTransition(existing.status, status);

    const now = new Date().toISOString();
    const patch: Parameters<TicketRepository["update"]>[0] = {
      companyId: input.companyId,
      ticketId: input.ticketId,
      updatedBy: actorUserId,
      status,
    };

    if (status === "closed" || status === "resolved") {
      patch.closedAt = now;
      patch.closedBy = actorUserId;
      patch.resolvedAt = now;
    }

    const record = await this.deps.tickets.update(patch);

    await this.writeAudit(input.companyId, actorUserId, "UPDATE", "support_ticket", input.ticketId, {
      status,
    });

    await this.deps.events.publish(createTicketStatusChangedEvent(record, actorUserId, existing.status));
    if (status === "closed" || status === "resolved") {
      await this.deps.events.publish(createTicketClosedEvent(record, actorUserId));
    }

    await this.deps.notifications.notify({
      kind: "status_change",
      companyId: input.companyId,
      ticketId: record.id,
      ticketNumber: record.ticketNumber,
      subject: record.subject,
      actorUserId,
      recipientUserId: record.assignedUserId,
      customerId: record.customerId,
      conversationId: record.conversationId,
      metadata: { previousStatus: existing.status, newStatus: status },
    });

    return { ticket: toTicketSummary(record) };
  }

  async addComment(
    ctx: TicketServiceContext,
    input: { companyId: string; ticketId: string; body: string; isInternal?: boolean },
  ): Promise<{ commentId: string; ticketId: string }> {
    const actorUserId = assertTicketActor(ctx);
    assertTicketCompanyAccess(ctx, input.companyId);
    assertTicketPermission(ctx, TICKET_PERMISSIONS.comment);

    const ticket = await this.requireTicket(input.companyId, input.ticketId);
    const body = readRequiredString(input.body, "Comment body");
    const isInternal = input.isInternal === true;

    const comment = await this.deps.comments.add({
      companyId: input.companyId,
      ticketId: input.ticketId,
      body,
      isInternal,
      createdBy: actorUserId,
    });

    if (!isInternal && !ticket.firstResponseAt) {
      await this.deps.tickets.update({
        companyId: input.companyId,
        ticketId: input.ticketId,
        updatedBy: actorUserId,
        firstResponseAt: new Date().toISOString(),
      });
    }

    await this.writeAudit(input.companyId, actorUserId, "CREATE", "support_ticket_comment", comment.id, {
      ticketId: input.ticketId,
      isInternal,
    });

    await this.deps.events.publish(createTicketCommentAddedEvent(ticket, comment, actorUserId));
    await this.deps.notifications.notify({
      kind: "comment",
      companyId: input.companyId,
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      actorUserId,
      recipientUserId: ticket.assignedUserId,
      customerId: ticket.customerId,
      conversationId: ticket.conversationId,
      metadata: { isInternal, commentId: comment.id },
    });

    return { commentId: comment.id, ticketId: input.ticketId };
  }

  async addInternalNote(
    ctx: TicketServiceContext,
    input: { companyId: string; ticketId: string; body: string },
  ): Promise<{ commentId: string; ticketId: string }> {
    return this.addComment(ctx, { ...input, isInternal: true });
  }

  private async requireTicket(companyId: string, ticketId: string) {
    const ticket = await this.deps.tickets.findById(companyId, ticketId);
    if (!ticket) throw new TicketNotFoundError(ticketId);
    return ticket;
  }

  private async writeAudit(
    companyId: string,
    userId: string,
    action: "CREATE" | "UPDATE" | "DELETE",
    entity: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.deps.audit.write({ companyId, userId, action, entity, entityId, metadata });
  }

  private async checkSlaNotifications(
    ticket: Awaited<ReturnType<TicketRepository["findById"]>> & object,
    actorUserId: string,
  ): Promise<void> {
    if (!ticket.slaDueAt) return;

    if (isSlaBreached(ticket.slaDueAt)) {
      await this.deps.notifications.notify({
        kind: "sla_breach",
        companyId: ticket.companyId,
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        actorUserId,
        recipientUserId: ticket.assignedUserId,
        customerId: ticket.customerId,
        conversationId: ticket.conversationId,
        metadata: { slaDueAt: ticket.slaDueAt },
      });
      return;
    }

    if (isSlaWarning(ticket.slaDueAt)) {
      await this.deps.notifications.notify({
        kind: "sla_warning",
        companyId: ticket.companyId,
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        actorUserId,
        recipientUserId: ticket.assignedUserId,
        customerId: ticket.customerId,
        conversationId: ticket.conversationId,
        metadata: { slaDueAt: ticket.slaDueAt },
      });
    }
  }
}
