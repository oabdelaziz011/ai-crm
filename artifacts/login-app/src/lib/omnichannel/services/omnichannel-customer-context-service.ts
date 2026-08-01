import type { TimelineAccess } from "@/lib/customer-timeline/types";
import { fetchCustomerProfileMetrics } from "@/lib/customer-timeline/customer-metrics";
import type { OmnichannelCustomerContext } from "@/lib/omnichannel/types/unified-conversation";

export type OmnichannelCustomerContextInput = {
  customerId: string;
  companyId: string;
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

  const timelinePreview = metrics.lastInteractionAt
    ? [`Last interaction: ${new Date(metrics.lastInteractionAt).toLocaleString()}`]
    : [];

  return {
    customer: null,
    openTickets: 0,
    recentBookings: metrics.bookingsCount,
    outstandingInvoices: metrics.invoicesCount,
    timelinePreview,
    knowledgeSuggestions: [],
    recentAiActions: [],
  };
}
