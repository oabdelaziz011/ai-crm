import { supabase } from "@/lib/supabase";
import type { TimelineAccess } from "@/lib/customer-timeline/types";
import { fetchCustomerProfileMetrics } from "@/lib/customer-timeline/customer-metrics";
import type { OmnichannelCustomerContext } from "@/lib/omnichannel/types/unified-conversation";
import {
  buildTicketReadAccess,
  createLoginAppTicketReadPort,
} from "@/lib/ticket-platform/ticket-read-port-adapter";

export type OmnichannelCustomerContextInput = {
  customerId: string;
  companyId: string;
  conversationId?: string;
  access: TimelineAccess;
};

const EMPTY_CONTEXT: OmnichannelCustomerContext = {
  customer: null,
  openTickets: 0,
  recentBookings: 0,
  outstandingInvoices: 0,
  timelinePreview: [],
  knowledgeSuggestions: [],
  recentAiActions: [],
};

/**
 * Single service for omnichannel CRM sidebar context.
 * Bookings, invoices, orders, tickets, and metrics flow through one entry point.
 */
export async function fetchOmnichannelCustomerContext(
  input: OmnichannelCustomerContextInput | null,
): Promise<OmnichannelCustomerContext> {
  if (!input?.customerId || !input.companyId) return EMPTY_CONTEXT;

  const metrics = await fetchCustomerProfileMetrics({
    companyId: input.companyId,
    customerId: input.customerId,
    access: input.access,
  });

  const ticketReads = createLoginAppTicketReadPort(supabase);
  const readAccess = buildTicketReadAccess({
    companyId: input.companyId,
    actorUserId: input.access.userId,
    isSuperAdmin: input.access.isSuperAdmin,
    hasPermission: input.access.hasPermission,
  });

  const openTickets = input.access.hasPermission("tickets.view")
    ? await ticketReads.countOpenByCustomer(readAccess, {
        companyId: input.companyId,
        customerId: input.customerId,
      })
    : 0;

  const timelinePreview = metrics.lastInteractionAt
    ? [`Last interaction: ${new Date(metrics.lastInteractionAt).toLocaleString()}`]
    : [];

  if (openTickets > 0) {
    timelinePreview.unshift(`${openTickets} open ticket${openTickets === 1 ? "" : "s"}`);
  }

  return {
    customer: null,
    openTickets,
    recentBookings: metrics.bookingsCount,
    outstandingInvoices: metrics.invoicesCount,
    timelinePreview,
    knowledgeSuggestions: [],
    recentAiActions: [],
  };
}

export async function fetchConversationTickets(
  companyId: string,
  conversationId: string,
  access: TimelineAccess,
): Promise<Array<{ id: string; ticketNumber: string; subject: string; status: string; createdAt: string; updatedAt: string }>> {
  if (!access.hasPermission("tickets.view")) return [];

  const ticketReads = createLoginAppTicketReadPort(supabase);
  const readAccess = buildTicketReadAccess({
    companyId,
    actorUserId: access.userId,
    isSuperAdmin: access.isSuperAdmin,
    hasPermission: access.hasPermission,
  });

  const result = await ticketReads.listConversationTickets(readAccess, { companyId, conversationId });
  return result.tickets.map((ticket) => ({
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    subject: ticket.subject,
    status: ticket.status,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  }));
}
