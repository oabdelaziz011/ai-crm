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
  return {
    async notify(input: TicketNotificationInput): Promise<void> {
      try {
        const recipientUserId = input.recipientUserId?.trim();
        if (!recipientUserId) return;

        const { notifications } = getNotificationServices();
        await notifications.createNotification({
          companyId: input.companyId,
          event: "generic_system",
          userId: input.actorUserId,
          recipients: [{ userId: recipientUserId, companyId: input.companyId }],
          channels: ["in_app"],
          params: {
            title: NOTIFICATION_EVENT_BY_KIND[input.kind],
            kind: NOTIFICATION_EVENT_BY_KIND[input.kind],
            ticketId: input.ticketId,
            ticketNumber: input.ticketNumber,
            subject: input.subject,
            body: [input.ticketNumber, input.subject].filter(Boolean).join(" — "),
            detail: [input.ticketNumber, input.subject].filter(Boolean).join(" — "),
            ...(input.metadata ?? {}),
          },
        });
      } catch (error) {
        console.warn(
          "[ticket-platform] notification bridge failed:",
          error instanceof Error ? error.message : error,
        );
      }
    },
  };
}
