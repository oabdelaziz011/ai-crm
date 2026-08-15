import type { TicketMetricsSnapshot } from "@workspace/ticket-platform";
import { supabase } from "@/lib/supabase";
import {
  buildDashboardTicketReadAccess,
  createLoginAppTicketReadPort,
} from "@/lib/ticket-platform/ticket-read-port-adapter";

function startOfTodayIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

/**
 * Company ticket KPIs via ticket_platform_company_metrics_v1 plus real COUNT
 * queries for inbox-specific KPIs (unassigned / SLA at risk / total).
 */
export async function fetchTicketInboxMetrics(companyId: string): Promise<TicketMetricsSnapshot> {
  const ticketReads = createLoginAppTicketReadPort(supabase);
  const metrics = await ticketReads.fetchMetrics(buildDashboardTicketReadAccess(companyId), {
    companyId,
    todayStartIso: startOfTodayIso(),
  });

  const byStatus = metrics.ticketsByStatus ?? {};
  const byPriority = metrics.ticketsByPriority ?? {};
  const statusTotal = Object.values(byStatus).reduce((sum, n) => sum + Number(n || 0), 0);

  const now = new Date();
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

  const [totalRes, unassignedRes, atRiskRes] = await Promise.all([
    supabase
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("deleted_at", null),
    supabase
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .in("status", ["open", "in_progress", "waiting_customer"])
      .is("assigned_user_id", null),
    supabase
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .in("status", ["open", "in_progress", "waiting_customer"])
      .not("sla_due_at", "is", null)
      .gte("sla_due_at", now.toISOString())
      .lte("sla_due_at", inOneHour),
  ]);

  if (totalRes.error) throw new Error(totalRes.error.message);
  if (unassignedRes.error) throw new Error(unassignedRes.error.message);
  if (atRiskRes.error) throw new Error(atRiskRes.error.message);

  const totalTickets = totalRes.count ?? statusTotal;
  const highUrgentTickets =
    Number(metrics.highUrgentTickets ?? 0) > 0
      ? Number(metrics.highUrgentTickets)
      : Number(byPriority.high ?? 0) + Number(byPriority.urgent ?? 0);

  return {
    ...metrics,
    totalTickets,
    unassignedTickets: unassignedRes.count ?? 0,
    highUrgentTickets,
    slaAtRiskOpen: atRiskRes.count ?? 0,
  };
}
