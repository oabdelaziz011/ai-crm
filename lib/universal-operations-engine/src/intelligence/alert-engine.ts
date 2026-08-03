import type { OperationalAlert } from "../types/intelligence-types.js";
import type { OperationsCustomer360WorkspaceData } from "../types/customer360-panel-types.js";

export type AlertRuleDefinition = {
  id: string;
  alertType: string;
  titleKey: string;
  messageKey: string;
  severity: OperationalAlert["severity"];
  priority: OperationalAlert["priority"];
  color: string;
  icon: string;
  actionKey: string | null;
  evaluate: (ctx: OperationsCustomer360WorkspaceData) => boolean;
};

const RULE_LABELS: Record<string, { title: string; message: string }> = {
  vip: { title: "VIP Customer", message: "This customer has VIP status — prioritize service." },
  outstanding: { title: "Outstanding Balance", message: "Payment balance remains on account." },
  complaint: { title: "Previous Complaint", message: "Customer filed a complaint within the last 90 days." },
  birthday_today: { title: "Birthday Today", message: "Wish them a happy birthday during check-in." },
  waiting_long: { title: "Extended Wait", message: "Customer has been waiting longer than the target threshold." },
  payment_delay: { title: "Payment Delay", message: "Partial payment outstanding beyond expected window." },
  high_priority: { title: "High Priority", message: "Flagged as high priority for today's operation." },
  medical: { title: "Medical Alert", message: "Allergic to penicillin — review before treatment." },
  low_satisfaction: { title: "Low Satisfaction", message: "Recent satisfaction score below team average." },
  no_show_history: { title: "No-Show History", message: "Customer has previous no-show records." },
};

export class AlertEngine {
  private readonly rules: AlertRuleDefinition[];

  constructor(rules?: AlertRuleDefinition[]) {
    this.rules = rules ?? buildDefaultRules();
  }

  evaluate(ctx: OperationsCustomer360WorkspaceData): OperationalAlert[] {
    return this.rules
      .filter((rule) => rule.evaluate(ctx))
      .map((rule) => {
        const labels = RULE_LABELS[rule.alertType] ?? { title: rule.alertType, message: "" };
        return {
          id: rule.id,
          alertType: rule.alertType,
          title: labels.title,
          message: labels.message,
          severity: rule.severity,
          priority: rule.priority,
          color: rule.color,
          icon: rule.icon,
          actionKey: rule.actionKey,
        };
      })
      .sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority));
  }
}

function priorityWeight(p: OperationalAlert["priority"]): number {
  return { urgent: 4, high: 3, normal: 2, low: 1 }[p];
}

function buildDefaultRules(): AlertRuleDefinition[] {
  return [
    {
      id: "alert_vip",
      alertType: "vip",
      titleKey: "alerts.vip",
      messageKey: "alerts.vipMsg",
      severity: "info",
      priority: "high",
      color: "#f59e0b",
      icon: "Star",
      actionKey: "assign_vip",
      evaluate: (ctx) => ctx.summary.isVip,
    },
    {
      id: "alert_balance",
      alertType: "outstanding",
      titleKey: "alerts.outstanding",
      messageKey: "alerts.outstandingMsg",
      severity: "warning",
      priority: "high",
      color: "#ef4444",
      icon: "CreditCard",
      actionKey: "collect_payment",
      evaluate: (ctx) => ctx.outstandingBalanceCents > 0,
    },
    {
      id: "alert_waiting",
      alertType: "waiting_long",
      titleKey: "alerts.waiting",
      messageKey: "alerts.waitingMsg",
      severity: "warning",
      priority: "urgent",
      color: "#f97316",
      icon: "Clock",
      actionKey: "notify_staff",
      evaluate: (ctx) => ctx.todaysOperation.countdownMinutes > 15,
    },
    {
      id: "alert_payment",
      alertType: "payment_delay",
      titleKey: "alerts.paymentDelay",
      messageKey: "alerts.paymentDelayMsg",
      severity: "warning",
      priority: "normal",
      color: "#eab308",
      icon: "Banknote",
      actionKey: "collect_payment",
      evaluate: (ctx) => ctx.currentPaymentStatus.toLowerCase().includes("partial"),
    },
    {
      id: "alert_medical",
      alertType: "medical",
      titleKey: "alerts.medical",
      messageKey: "alerts.medicalMsg",
      severity: "critical",
      priority: "urgent",
      color: "#dc2626",
      icon: "AlertTriangle",
      actionKey: "view_notes",
      evaluate: (ctx) => ctx.notesExtended.some((n) => n.body.toLowerCase().includes("allergic")),
    },
    {
      id: "alert_noshow",
      alertType: "no_show_history",
      titleKey: "alerts.noShow",
      messageKey: "alerts.noShowMsg",
      severity: "info",
      priority: "normal",
      color: "#64748b",
      icon: "UserX",
      actionKey: "confirm_attendance",
      evaluate: (ctx) => ctx.bookings.some((b) => b.status === "No Show"),
    },
    {
      id: "alert_satisfaction",
      alertType: "low_satisfaction",
      titleKey: "alerts.satisfaction",
      messageKey: "alerts.satisfactionMsg",
      severity: "info",
      priority: "low",
      color: "#8b5cf6",
      icon: "TrendingDown",
      actionKey: "escalate",
      evaluate: (ctx) => ctx.summary.satisfaction < 4,
    },
  ];
}

export const alertEngine = new AlertEngine();
