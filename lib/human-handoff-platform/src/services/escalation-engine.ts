import type { EscalationRuleRecord, EscalationTrigger } from "../types/handoff-types.js";

export type EscalationEvaluationInput = {
  triggerCode: EscalationTrigger;
  rules: EscalationRuleRecord[];
  conversationPriority?: string;
  metadata?: Record<string, unknown>;
};

export function resolveEscalationRule(input: EscalationEvaluationInput): EscalationRuleRecord | null {
  const direct = input.rules.find(
    (rule) => rule.isActive && rule.triggerCode === input.triggerCode,
  );
  if (direct) return direct;
  return input.rules.find((rule) => rule.isActive && rule.triggerCode === "manual") ?? null;
}

export function applyPriorityBoost(currentPriority: string, boost: string): string {
  const order = ["low", "normal", "high", "urgent"];
  const currentIndex = order.indexOf(currentPriority);
  const boostIndex = order.indexOf(boost);
  if (currentIndex < 0 || boostIndex < 0) return currentPriority;
  return order[Math.max(currentIndex, boostIndex)] ?? currentPriority;
}
