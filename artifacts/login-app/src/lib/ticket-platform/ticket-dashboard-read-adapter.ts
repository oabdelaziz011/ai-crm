import { supabase } from "@/lib/supabase";
import {
  buildDashboardTicketReadAccess,
  createLoginAppTicketReadPort,
} from "@/lib/ticket-platform/ticket-read-port-adapter";
import type { SupportMetricsData } from "@workspace/dashboard-engine";

function startOfTodayIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

export async function fetchSupportTicketMetrics(companyId: string): Promise<SupportMetricsData> {
  const ticketReads = createLoginAppTicketReadPort(supabase);
  const metrics = await ticketReads.fetchMetrics(buildDashboardTicketReadAccess(companyId), {
    companyId,
    todayStartIso: startOfTodayIso(),
  });

  return {
    openTickets: metrics.openTickets,
    closedToday: metrics.closedToday,
    slaCompliancePercent: metrics.slaCompliancePercent,
    averageResponseMinutes: metrics.averageResponseMinutes,
    averageResolutionMinutes: metrics.averageResolutionMinutes,
    ticketsByPriority: metrics.ticketsByPriority,
    ticketsByStatus: metrics.ticketsByStatus,
    ticketsByAgent: metrics.ticketsByAgent,
    totalTickets: metrics.totalTickets,
    unassignedTickets: metrics.unassignedTickets,
    highUrgentTickets: metrics.highUrgentTickets,
    slaBreaches: metrics.slaBreaches,
    slaBreachesOpen: metrics.slaBreachesOpen,
    slaAtRiskOpen: metrics.slaAtRiskOpen,
  };
}
