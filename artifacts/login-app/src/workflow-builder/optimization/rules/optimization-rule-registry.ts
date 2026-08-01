import type { WorkflowOptimizationInput } from "../types/optimization-types";
import type { OptimizationRecommendation } from "../types/optimization-types";

export type OptimizationRule = {
  id: string;
  evaluate(input: WorkflowOptimizationInput): readonly OptimizationRecommendation[];
};

export type OptimizationRuleRegistry = {
  register(rule: OptimizationRule): void;
  evaluateAll(input: WorkflowOptimizationInput): readonly OptimizationRecommendation[];
  list(): readonly OptimizationRule[];
};

export function createOptimizationRuleRegistry(rules: readonly OptimizationRule[] = []): OptimizationRuleRegistry {
  const registry = new Map<string, OptimizationRule>();
  for (const rule of rules) {
    registry.set(rule.id, rule);
  }

  return {
    register(rule) {
      registry.set(rule.id, rule);
    },
    list() {
      return [...registry.values()];
    },
    evaluateAll(input) {
      return [...registry.values()].flatMap((rule) => rule.evaluate(input));
    },
  };
}
