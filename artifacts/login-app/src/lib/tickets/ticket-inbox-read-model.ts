import type { TicketSummary } from "@workspace/ticket-platform";
import type { TicketInboxRow } from "./enrich-ticket-rows";
import { resolveTicketSlaState } from "./ticket-inbox-metrics";

/** Pure Ticket 360 overview read model (display-only fields). */
export type Ticket360OverviewReadModel = {
  ticketId: string;
  ticketNumber: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  customerId: string | null;
  customerName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  createdAt: string;
  updatedAt: string;
  slaDueAt: string | null;
  slaState: TicketInboxRow["slaState"];
  conversationId: string | null;
  channelType: string | null;
};

export function buildTicket360OverviewReadModel(
  ticket: TicketSummary | TicketInboxRow,
): Ticket360OverviewReadModel {
  const enriched = ticket as TicketInboxRow;
  return {
    ticketId: ticket.id,
    ticketNumber: ticket.ticketNumber,
    subject: ticket.subject,
    description: ticket.description ?? "",
    status: ticket.status,
    priority: ticket.priority,
    customerId: ticket.customerId,
    customerName: enriched.customerName ?? null,
    assigneeId: ticket.assignedUserId,
    assigneeName: ticket.assignedUserName,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    slaDueAt: ticket.slaDueAt,
    slaState:
      enriched.slaState ??
      resolveTicketSlaState({
        slaDueAt: ticket.slaDueAt,
        status: ticket.status,
        resolvedAt: ticket.resolvedAt,
        closedAt: ticket.closedAt,
      }),
    conversationId: ticket.conversationId,
    channelType: enriched.channelType ?? null,
  };
}

export function resolveTicketListOffset(page: number, pageSize: number): number {
  const safePage = Math.max(1, page);
  const safeSize = Math.min(100, Math.max(1, pageSize));
  return (safePage - 1) * safeSize;
}

export function resolveAssignedUserSearchFilter(
  assignedUserId: string | "all" | "unassigned" | undefined,
): { assignedUserId?: string; unassignedOnly?: boolean } {
  if (!assignedUserId || assignedUserId === "all") return {};
  if (assignedUserId === "unassigned") return { unassignedOnly: true };
  return { assignedUserId };
}
