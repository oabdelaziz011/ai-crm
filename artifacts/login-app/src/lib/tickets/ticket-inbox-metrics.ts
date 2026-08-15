import type { TicketMetricsSnapshot } from "@workspace/ticket-platform";
import { isSlaBreached, isSlaWarning } from "@workspace/ticket-platform";

export type TicketSlaState = "safe" | "at_risk" | "breached" | "none";

/** Real SLA badge state from existing timestamps (no fake countdowns). */
export function resolveTicketSlaState(
  input: {
    slaDueAt: string | null;
    status: string;
    resolvedAt?: string | null;
    closedAt?: string | null;
  },
  referenceNow = new Date(),
): TicketSlaState {
  if (!input.slaDueAt) return "none";

  const terminal = input.status === "resolved" || input.status === "closed";
  if (terminal) {
    const endAt = input.resolvedAt ?? input.closedAt;
    if (!endAt) return "none";
    return new Date(endAt).getTime() > new Date(input.slaDueAt).getTime() ? "breached" : "safe";
  }

  if (isSlaBreached(input.slaDueAt, referenceNow)) return "breached";
  if (isSlaWarning(input.slaDueAt, referenceNow, 1)) return "at_risk";
  return "safe";
}

export type TicketInboxKpiId =
  | "all"
  | "open"
  | "in_progress"
  | "pending"
  | "resolved"
  | "closed"
  | "unassigned"
  | "high_urgent"
  | "sla_at_risk"
  | "sla_breached";

export type TicketInboxKpi = {
  id: TicketInboxKpiId;
  value: number;
};

/** Map company metrics RPC payload to inbox KPI strip (real values only). */
export function mapTicketInboxKpis(metrics: TicketMetricsSnapshot): TicketInboxKpi[] {
  const byStatus = metrics.ticketsByStatus ?? {};
  const byPriority = metrics.ticketsByPriority ?? {};
  const statusTotal = Object.values(byStatus).reduce((sum, n) => sum + Number(n || 0), 0);
  const total = metrics.totalTickets > 0 ? metrics.totalTickets : statusTotal;

  return [
    { id: "all", value: total },
    { id: "open", value: Number(byStatus.open ?? 0) },
    { id: "in_progress", value: Number(byStatus.in_progress ?? 0) },
    { id: "pending", value: Number(byStatus.waiting_customer ?? 0) },
    { id: "resolved", value: Number(byStatus.resolved ?? 0) },
    { id: "closed", value: Number(byStatus.closed ?? 0) },
    { id: "unassigned", value: Number(metrics.unassignedTickets ?? 0) },
    {
      id: "high_urgent",
      value:
        metrics.highUrgentTickets > 0
          ? metrics.highUrgentTickets
          : Number(byPriority.high ?? 0) + Number(byPriority.urgent ?? 0),
    },
    { id: "sla_at_risk", value: Number(metrics.slaAtRiskOpen ?? 0) },
    { id: "sla_breached", value: Number(metrics.slaBreachesOpen ?? metrics.slaBreaches ?? 0) },
  ];
}
