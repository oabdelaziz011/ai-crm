import type { ExecutiveAlertRepository } from "@/lib/executive/repositories/executive-alert-repository";
import type { ExecutiveDashboardSnapshot, AlertType, AlertSeverity } from "@/lib/executive/types";

type AlertRule = {
  type: AlertType;
  severity: AlertSeverity;
  evaluate: (snapshot: ExecutiveDashboardSnapshot) => { triggered: boolean; title: string; message: string; metricValue?: number; threshold?: number } | null;
};

const RULES: AlertRule[] = [
  {
    type: "revenue_dropped",
    severity: "warning",
    evaluate: (s) =>
      s.summary.trends.revenue === "down" && s.summary.todayRevenueCents < s.summary.monthlyRevenueCents / 30
        ? { triggered: true, title: "Revenue dropped", message: "Today's revenue is below daily average.", metricValue: s.summary.todayRevenueCents }
        : null,
  },
  {
    type: "bookings_below_target",
    severity: "info",
    evaluate: (s) =>
      s.summary.bookingsToday < 5
        ? { triggered: true, title: "Bookings below target", message: "Fewer than 5 bookings today.", metricValue: s.summary.bookingsToday, threshold: 5 }
        : null,
  },
  {
    type: "high_cancellation",
    severity: "warning",
    evaluate: (s) =>
      s.operational.cancellationRate > 20
        ? { triggered: true, title: "High cancellation rate", message: `Cancellation rate is ${s.operational.cancellationRate}%.`, metricValue: s.operational.cancellationRate, threshold: 20 }
        : null,
  },
  {
    type: "high_no_show",
    severity: "critical",
    evaluate: (s) =>
      s.operational.noShowRate > 15
        ? { triggered: true, title: "High no-show rate", message: `No-show rate is ${s.operational.noShowRate}%.`, metricValue: s.operational.noShowRate, threshold: 15 }
        : null,
  },
  {
    type: "long_waiting_time",
    severity: "warning",
    evaluate: (s) =>
      s.operational.averageWaitingMinutes > 30
        ? { triggered: true, title: "Long waiting times", message: `Average wait is ${s.operational.averageWaitingMinutes} minutes.`, metricValue: s.operational.averageWaitingMinutes, threshold: 30 }
        : null,
  },
  {
    type: "payment_failures",
    severity: "critical",
    evaluate: (s) =>
      s.communication.failedMessages > 0 && s.financial.outstandingInvoicesCents > 0
        ? { triggered: true, title: "Outstanding invoices", message: "There are unpaid invoices requiring attention.", metricValue: s.financial.outstandingInvoicesCents }
        : null,
  },
  {
    type: "communication_failures",
    severity: "warning",
    evaluate: (s) =>
      s.communication.failedMessages > 5
        ? { triggered: true, title: "Communication failures", message: `${s.communication.failedMessages} messages failed.`, metricValue: s.communication.failedMessages, threshold: 5 }
        : null,
  },
  {
    type: "doctor_overload",
    severity: "warning",
    evaluate: (s) => {
      const overloaded = s.doctors.find((d) => d.utilization > 90);
      return overloaded
        ? { triggered: true, title: "Doctor overload", message: `${overloaded.resourceName} is at ${overloaded.utilization}% utilization.`, metricValue: overloaded.utilization, threshold: 90 }
        : null;
    },
  },
  {
    type: "branch_overload",
    severity: "warning",
    evaluate: (s) => {
      const overloaded = s.branches.find((b) => b.occupancy > 90);
      return overloaded
        ? { triggered: true, title: "Branch overload", message: `${overloaded.branchName} is at ${overloaded.occupancy}% occupancy.`, metricValue: overloaded.occupancy, threshold: 90 }
        : null;
    },
  },
  {
    type: "outstanding_invoices",
    severity: "info",
    evaluate: (s) =>
      s.summary.outstandingBalanceCents > 100_000
        ? { triggered: true, title: "Outstanding balance", message: "Significant outstanding balance detected.", metricValue: s.summary.outstandingBalanceCents }
        : null,
  },
];

/** Intelligent alerts engine with audit trail. */
export class AlertEngineService {
  constructor(private readonly repository: ExecutiveAlertRepository) {}

  async evaluateAndPersist(companyId: string, snapshot: ExecutiveDashboardSnapshot) {
    const created = [];
    for (const rule of RULES) {
      const result = rule.evaluate(snapshot);
      if (!result?.triggered) continue;

      const alert = await this.repository.create({
        companyId,
        alertType: rule.type,
        severity: rule.severity,
        title: result.title,
        message: result.message,
        metricKey: rule.type,
        metricValue: result.metricValue,
        thresholdValue: result.threshold,
      });
      created.push(alert);
    }
    return created;
  }

  async listActive(companyId: string) {
    return this.repository.listActive(companyId);
  }

  async dismiss(companyId: string, alertId: string, actorId: string) {
    return this.repository.dismiss(companyId, alertId, actorId);
  }

  async resolve(companyId: string, alertId: string, actorId: string) {
    return this.repository.resolve(companyId, alertId, actorId);
  }
}
