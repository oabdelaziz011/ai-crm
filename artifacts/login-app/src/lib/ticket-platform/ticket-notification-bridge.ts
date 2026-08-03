import { getNotificationServices } from "@/lib/notifications";
import type { TicketNotificationInput, TicketNotificationPort } from "@workspace/ticket-platform";

const NOTIFICATION_EVENT_BY_KIND: Record<TicketNotificationInput["kind"], string> = {
  assignment: "ticket_assigned",
  comment: "ticket_comment",
  status_change: "ticket_status_changed",
  priority_change: "ticket_priority_changed",
  close: "ticket_closed",
  sla_warning: "ticket_sla_warning",
  sla_breach: "ticket_sla_breach",
};

export function createTicketNotificationBridge(): TicketNotificationPort {
  const { notifications } = getNotificationServices();

  return {
    async notify(input: TicketNotificationInput): Promise<void> {
      const recipientUserId = input.recipientUserId?.trim();
      if (!recipientUserId) return;

      await notifications.createNotification({
        companyId: input.companyId,
        event: "generic_system",
        userId: input.actorUserId,
        recipients: [{ userId: recipientUserId }],
        channels: ["in_app"],
        params: {
          ticketId: input.ticketId,
          ticketNumber: input.ticketNumber,
          subject: input.subject,
          kind: NOTIFICATION_EVENT_BY_KIND[input.kind],
          ...(input.metadata ?? {}),
        },
      });
    },
  };
}
