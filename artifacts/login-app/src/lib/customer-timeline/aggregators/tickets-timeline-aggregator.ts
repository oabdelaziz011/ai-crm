import { supabase } from "@/lib/supabase";
import {
  buildTicketReadAccess,
  createLoginAppTicketReadPort,
} from "@/lib/ticket-platform/ticket-read-port-adapter";
import type { TimelineActivity, TimelineActivitySource, TimelineFetchInput } from "@/lib/customer-timeline/types";
import { truncateText } from "@/lib/customer-timeline/provider-utils";

export class TicketsTimelineAggregator implements TimelineActivitySource {
  readonly sourceId = "tickets";

  async collect({ customerId, companyId, access }: TimelineFetchInput): Promise<TimelineActivity[]> {
    if (!companyId || !customerId || !access) return [];
    if (!access.hasPermission("tickets.view")) return [];

    const ticketReads = createLoginAppTicketReadPort(supabase);
    const readAccess = buildTicketReadAccess({
      companyId,
      actorUserId: access.userId,
      isSuperAdmin: access.isSuperAdmin,
      hasPermission: access.hasPermission,
    });

    const { tickets } = await ticketReads.listCustomerTickets(readAccess, {
      companyId,
      customerId,
      limit: 100,
    });

    return tickets.map((ticket) => {
      const detail = truncateText(`${ticket.ticketNumber} · ${ticket.subject}`);
      const eventType =
        ticket.status === "closed" || ticket.status === "resolved"
          ? "ticket_closed"
          : "ticket_created";

      return {
        id: `${this.sourceId}:${ticket.id}`,
        type: eventType,
        occurredAt: ticket.updatedAt,
        source: this.sourceId,
        category: "system",
        payload: {
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber,
          status: ticket.status,
          priority: ticket.priority,
        },
        metadata: {
          detail,
          status: ticket.status,
          priority: ticket.priority,
          searchText: [ticket.ticketNumber, ticket.subject, ticket.status, ticket.priority, "ticket"].join(" "),
          filterGroup: "tickets",
        },
        visibility: "internal",
      } satisfies TimelineActivity;
    });
  }
}
