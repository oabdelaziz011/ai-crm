import type { OperationalAlert } from "../types/intelligence-types.js";
import type { OperationsCustomer360WorkspaceData } from "../types/customer360-panel-types.js";
import { OperationsRuntimeConfigurationError } from "../runtime/runtime-configuration-error.js";

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

  constructor(rules: AlertRuleDefinition[]) {
    if (!rules.length) {
      throw new OperationsRuntimeConfigurationError(
        "configuration.intelligence.alertRules is required — no runtime alert fallback available",
      );
    }
    this.rules = rules;
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
