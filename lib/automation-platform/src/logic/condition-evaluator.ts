import { evaluateRuleSet } from "./expression-engine.js";
import type { CompiledRuleSet, EvaluationContext, SwitchNodeConfig } from "./types.js";
import { resolveFieldValue } from "./expression-engine.js";

export function evaluateIfElseCondition(ruleSet: CompiledRuleSet, context: EvaluationContext): "yes" | "no" {
  return evaluateRuleSet(ruleSet, context) ? "yes" : "no";
}

export function evaluateSwitchCase(config: SwitchNodeConfig, context: EvaluationContext): string {
  const actual = resolveFieldValue(config.field, context.variables);
  const actualString = actual == null ? "" : String(actual);
  const matched = config.cases.find((item) => String(item.value) === actualString);
  return matched?.id ?? "default";
}
