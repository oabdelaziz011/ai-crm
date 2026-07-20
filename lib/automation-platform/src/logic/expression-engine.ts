import { getOperator } from "./operator-registry.js";
import { registerBuiltInOperators } from "./operator-registry.js";
import type { CompiledRuleSet, EvaluationContext, RuleClause, RuleGroup } from "./types.js";

export function compileRuleSet(ruleSet: CompiledRuleSet): CompiledRuleSet {
  return structuredClone(ruleSet);
}

export function resolveFieldValue(field: string, variables: Record<string, unknown>): unknown {
  const normalized = field.replace(/^\{\{|\}\}$/g, "").trim();
  if (!normalized) return undefined;
  if (Object.prototype.hasOwnProperty.call(variables, normalized)) return variables[normalized];

  const segments = normalized.split(".");
  let current: unknown = variables;
  for (const segment of segments) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function isRuleGroup(entry: RuleClause | RuleGroup): entry is RuleGroup {
  return "combinator" in entry && Array.isArray(entry.rules);
}

export function evaluateRuleClause(clause: RuleClause, context: EvaluationContext): boolean {
  registerBuiltInOperators();
  const actual = resolveFieldValue(clause.field, context.variables);
  const operator = getOperator(clause.operator);
  return operator.evaluate(actual, clause.value, clause.valueTo);
}

export function evaluateRuleGroup(group: RuleGroup, context: EvaluationContext): boolean {
  if (group.rules.length === 0) return false;
  const results = group.rules.map((entry) =>
    isRuleGroup(entry) ? evaluateRuleGroup(entry, context) : evaluateRuleClause(entry, context),
  );
  return group.combinator === "and" ? results.every(Boolean) : results.some(Boolean);
}

export function evaluateRuleSet(ruleSet: CompiledRuleSet, context: EvaluationContext): boolean {
  return evaluateRuleGroup(ruleSet.root, context);
}

export function validateRuleSet(ruleSet: CompiledRuleSet): string[] {
  const issues: string[] = [];

  const walk = (group: RuleGroup, path: string) => {
    if (group.rules.length === 0) {
      issues.push(`${path}: Add at least one rule.`);
      return;
    }
    for (const [index, entry] of group.rules.entries()) {
      if (isRuleGroup(entry)) {
        walk(entry, `${path}.${index + 1}`);
        continue;
      }
      if (!entry.field?.trim()) issues.push(`${path}.${index + 1}: Choose a field.`);
      if (!entry.operator) issues.push(`${path}.${index + 1}: Choose an operator.`);
      const operator = entry.operator ? getOperator(entry.operator) : null;
      if (operator?.requiresValue && (entry.value == null || String(entry.value).trim() === "")) {
        issues.push(`${path}.${index + 1}: Enter a value.`);
      }
      if (operator?.requiresSecondValue && (entry.valueTo == null || String(entry.valueTo).trim() === "")) {
        issues.push(`${path}.${index + 1}: Enter the second value.`);
      }
    }
  };

  registerBuiltInOperators();
  walk(ruleSet.root, "Rule group");
  return issues;
}
