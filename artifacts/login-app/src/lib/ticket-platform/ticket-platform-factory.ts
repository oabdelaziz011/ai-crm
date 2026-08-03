import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TICKET_WORKFLOW_EVENTS,
  createSupabaseTicketAuditPort,
  createTicketPlatformServices,
  type TicketDomainEvent,
  type TicketEventPublisherPort,
  type TicketPlatformServices,
} from "@workspace/ticket-platform";
import { dispatchAutomationEvent } from "@/lib/automation";
import { getEnterpriseEventPublisher } from "@/lib/integration/events/enterprise-event-publisher";
import type { WebhookEventType } from "@/lib/integration/types";
import { createTicketNotificationBridge } from "./ticket-notification-bridge.js";

const TICKET_WEBHOOK_EVENT_MAP: Partial<Record<string, WebhookEventType>> = {
  ticket_created: "ticket.created",
  ticket_updated: "ticket.updated",
  ticket_closed: "ticket.closed",
  ticket_reopened: "ticket.reopened",
  ticket_assigned: "ticket.assigned",
  ticket_comment_added: "ticket.comment_added",
  ticket_priority_changed: "ticket.priority_changed",
  ticket_deleted: "ticket.deleted",
  ticket_status_changed: "ticket.status_changed",
};

export function createTicketEventBridge(): TicketEventPublisherPort {
  return {
    async publish(event: TicketDomainEvent): Promise<void> {
      const workflowName = TICKET_WORKFLOW_EVENTS[event.type];
      const payload = event.payload;

      await dispatchAutomationEvent({
        name: workflowName,
        companyId: event.companyId,
        params: {
          ticketId: payload.ticketId,
          ticketNumber: payload.ticketNumber,
          status: payload.newStatus ?? payload.ticket?.status ?? "",
          priority: payload.newPriority ?? payload.ticket?.priority ?? "",
          customerId: payload.customerId ?? "",
          conversationId: payload.conversationId ?? "",
        },
        userId: payload.actorUserId,
      });

      const webhookType = TICKET_WEBHOOK_EVENT_MAP[event.type];
      if (webhookType) {
        await getEnterpriseEventPublisher().publish({
          companyId: event.companyId,
          eventType: webhookType,
          eventId: `${payload.ticketId}:${webhookType}:${event.occurredAt}`,
          payload: {
            ticketId: payload.ticketId,
            ticketNumber: payload.ticketNumber,
            status: payload.newStatus ?? payload.ticket?.status,
            priority: payload.newPriority ?? payload.ticket?.priority,
            customerId: payload.customerId,
            conversationId: payload.conversationId,
            assignedUserId: payload.assignedUserId,
            commentId: payload.commentId,
            eventType: event.type,
          },
        });
      }
    },
  };
}

export function createLoginAppTicketPlatformServices(
  client: SupabaseClient,
): TicketPlatformServices {
  return createTicketPlatformServices(client, {
    events: createTicketEventBridge(),
    notifications: createTicketNotificationBridge(),
    audit: createSupabaseTicketAuditPort(client),
  });
}
