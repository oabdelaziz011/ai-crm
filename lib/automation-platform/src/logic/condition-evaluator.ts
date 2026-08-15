import { evaluateRuleSet } from "./expression-engine.js";
import type { CompiledRuleSet, EvaluationContext, SwitchNodeConfig } from "./types.js";
import { resolveFieldValue } from "./expression-engine.js";

export function evaluateIfElseCondition(ruleSet: CompiledRuleSet, context: EvaluationContext): "yes" | "no" {
  return evaluateRuleSet(ruleSet, context) ? "yes" : "no";
}

export function evaluateSwitchCase(config: SwitchNodeConfig, context: EvaluationContext): string {
  const actual = resolveFieldValue(config.field, context.variables);
  const actualString = actual == null ? "" : String(actual).trim();
  const normalized = actualString.toLowerCase();

  const matched = config.cases.find((item) => {
    const value = String(item.value ?? "").trim();
    const label = String(item.label ?? "").trim();
    const id = String(item.id ?? "").trim();
    if (value === actualString || label === actualString || id === actualString) return true;
    // Decision labels are often Title Case while case values are lowercase ids.
    return (
      value.toLowerCase() === normalized ||
      label.toLowerCase() === normalized ||
      id.toLowerCase() === normalized
    );
  });

  if (!matched) return "default";
  // Route by case value (unique). Fall back to id for incomplete drafts.
  const valueKey = matched.value == null ? "" : String(matched.value).trim();
  return valueKey || matched.id || "default";
}
