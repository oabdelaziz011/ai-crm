import { createOptimizationRuleRegistry } from "./optimization-rule-registry";
import { builtInOptimizationRules } from "./built-in-optimization-rules";

export const defaultOptimizationRuleRegistry = createOptimizationRuleRegistry(builtInOptimizationRules);

export function createDefaultOptimizationRuleRegistry() {
  return createOptimizationRuleRegistry(builtInOptimizationRules);
}
