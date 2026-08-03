import type { MiniKpiCard, OperationalHealthMetric, QuickDecisionSnapshot } from "../types/intelligence-types.js";
import type { OperationsCustomer360WorkspaceData } from "../types/customer360-panel-types.js";

export class OperationalIntelligenceEngine {
  buildHealthMetrics(): OperationalHealthMetric[] {
    return [
      { id: "waiting", labelKey: "health.waiting", value: 7, tone: "warning" },
      { id: "avg_wait", labelKey: "health.avgWait", value: "14 min", trend: "+2m", tone: "warning" },
      { id: "delayed", labelKey: "health.delayed", value: 2, tone: "danger" },
      { id: "overload", labelKey: "health.overload", value: "Dr. Amira", tone: "warning" },
      { id: "pending_pay", labelKey: "health.pendingPayments", value: 5, tone: "default" },
      { id: "no_shows", labelKey: "health.noShows", value: 1, tone: "default" },
      { id: "completion", labelKey: "health.completion", value: "87%", trend: "+3%", tone: "success" },
    ];
  }

  buildMiniKpis(ctx: OperationsCustomer360WorkspaceData): MiniKpiCard[] {
    return [
      { id: "visits", labelKey: "kpi.visits", value: String(ctx.summary.totalVisits), trend: "+2", trendDirection: "up" },
      { id: "revenue", labelKey: "kpi.revenue", value: `$${(ctx.summary.totalRevenueCents / 100).toLocaleString()}`, trend: "+12%", trendDirection: "up" },
      { id: "ltv", labelKey: "kpi.ltv", value: `$${(ctx.summary.lifetimeValueCents / 100).toLocaleString()}`, trend: "+8%", trendDirection: "up" },
      { id: "cancel", labelKey: "kpi.cancelRate", value: "4%", trend: "-1%", trendDirection: "down" },
      { id: "avg_spend", labelKey: "kpi.avgSpend", value: "$78", trend: "+$5", trendDirection: "up" },
      { id: "health", labelKey: "kpi.aiHealth", value: `${ctx.summary.aiHealthScore}`, trend: "+3", trendDirection: "up" },
      { id: "satisfaction", labelKey: "kpi.satisfaction", value: `${ctx.summary.satisfaction}/5`, trend: "stable", trendDirection: "flat" },
      { id: "score", labelKey: "kpi.customerScore", value: "A", trend: "—", trendDirection: "flat" },
    ];
  }

  buildQuickDecision(ctx: OperationsCustomer360WorkspaceData, nextAction: string, nextActionKey: string): QuickDecisionSnapshot {
    return {
      outstandingPaymentCents: ctx.outstandingBalanceCents,
      currentStatus: ctx.currentStatus,
      assignedEmployee: ctx.todaysOperation.assignedEmployee,
      room: ctx.todaysOperation.room,
      resource: ctx.assignedResource ?? ctx.todaysOperation.assignedEmployee,
      priority: ctx.priority,
      risk: ctx.summary.riskLevel,
      nextAction,
      nextActionKey,
    };
  }
}

export const operationalIntelligenceEngine = new OperationalIntelligenceEngine();
