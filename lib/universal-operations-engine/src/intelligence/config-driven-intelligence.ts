import type { OperationsAiConfig, OperationsIntelligenceConfig } from "../types/extended-config-types.js";
import type { CopilotCapability } from "../types/intelligence-types.js";
import type { OperationsCustomer360WorkspaceData } from "../types/customer360-panel-types.js";
import { AlertEngine, type AlertRuleDefinition } from "./alert-engine.js";
import { RecommendationEngine } from "./recommendation-engine.js";
import { WorkflowEngine } from "./workflow-engine.js";
import { OperationsRuntimeConfigurationError } from "../runtime/runtime-configuration-error.js";

const ALERT_EVALUATORS: Record<string, (ctx: OperationsCustomer360WorkspaceData) => boolean> = {
  vip: (ctx) => ctx.summary.isVip,
  outstanding: (ctx) => ctx.outstandingBalanceCents > 0,
  waiting_long: (ctx) => ctx.todaysOperation.countdownMinutes > 15,
  payment_delay: (ctx) => ctx.currentPaymentStatus.toLowerCase().includes("partial"),
  medical: (ctx) => ctx.notesExtended.some((n) => n.body.toLowerCase().includes("allergic")),
  no_show_history: (ctx) => ctx.bookings.some((b) => b.status === "No Show"),
  low_satisfaction: (ctx) => ctx.summary.satisfaction < 4,
  complaint: (ctx) => ctx.timeline.some((e) => e.title.toLowerCase().includes("complaint")),
  birthday_today: () => false,
  high_priority: (ctx) => ctx.summary.riskLevel === "high",
};

export function buildAlertRulesFromConfig(intelligence: OperationsIntelligenceConfig): AlertRuleDefinition[] {
  return intelligence.alertRules
    .filter((rule) => rule.enabled)
    .map((rule) => ({
      id: rule.id,
      alertType: rule.alertType,
      titleKey: rule.titleKey,
      messageKey: rule.messageKey,
      severity: rule.severity,
      priority: rule.priority,
      color: rule.color,
      icon: rule.icon,
      actionKey: rule.actionKey,
      evaluate: ALERT_EVALUATORS[rule.alertType] ?? (() => false),
    }));
}

export function createConfiguredAlertEngine(intelligence: OperationsIntelligenceConfig): AlertEngine {
  const rules = buildAlertRulesFromConfig(intelligence);
  return new AlertEngine(rules);
}

export function createConfiguredWorkflowEngine(intelligence: OperationsIntelligenceConfig): WorkflowEngine {
  return new WorkflowEngine(intelligence.workflowStages);
}

export function createConfiguredRecommendationEngine(intelligence: OperationsIntelligenceConfig): RecommendationEngine {
  return new RecommendationEngine(intelligence.recommendationRules);
}

export function resolveCopilotCapabilities(ai?: OperationsAiConfig): CopilotCapability[] {
  if (ai && !ai.copilotEnabled) return [];
  const capabilities = ai?.copilotCapabilities ?? [];
  if (!capabilities.length) {
    throw new OperationsRuntimeConfigurationError(
      "configuration.ai.copilotCapabilities is required when copilot is enabled",
    );
  }
  if (!ai?.allowedTools?.length) return capabilities;
  return capabilities.filter((cap) => ai.allowedTools.includes(cap.promptKey));
}
