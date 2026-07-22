import type { RuleClause, RuleGroup } from "@workspace/automation-platform";
import { collectKnownInteractiveOptionIds } from "../graph/upstream-interactive-nodes";
import { isInteractionSelectionIdField } from "../variables/interaction-variables";
import type { ValidationIssue, WorkflowDocument } from "../types";

function isRuleGroup(entry: RuleClause | RuleGroup): entry is RuleGroup {
  return "combinator" in entry && Array.isArray(entry.rules);
}

function walkRuleGroup(
  group: RuleGroup,
  visitClause: (clause: RuleClause) => void,
): void {
  for (const entry of group.rules) {
    if (isRuleGroup(entry)) {
      walkRuleGroup(entry, visitClause);
      continue;
    }
    visitClause(entry);
  }
}

export function validateInteractiveLogicReferences(
  document: WorkflowDocument,
  nodeId: string,
  nodeType: "if_else" | "switch",
  config: Record<string, unknown>,
): ValidationIssue[] {
  const knownIds = collectKnownInteractiveOptionIds(document);
  const issues: ValidationIssue[] = [];

  const checkValue = (field: string, value: unknown, clauseId: string) => {
    if (!isInteractionSelectionIdField(field)) return;
    if (typeof value !== "string" || !value.trim()) return;
    if (knownIds.has(value)) return;
    issues.push({
      id: `${nodeId}-interactive-ref-${clauseId}`,
      nodeId,
      severity: "warning",
      message: `Selection id "${value}" is not defined on any Buttons or List step in this workflow.`,
      nodeType,
    });
  };

  if (nodeType === "if_else") {
    const ruleSet = config.ruleSet;
    if (!ruleSet || typeof ruleSet !== "object") return issues;
    const root = (ruleSet as { root?: RuleGroup }).root;
    if (!root) return issues;
    walkRuleGroup(root, (clause) => {
      checkValue(clause.field, clause.value, clause.id);
      checkValue(clause.field, clause.valueTo, `${clause.id}-to`);
    });
    return issues;
  }

  const field = typeof config.field === "string" ? config.field : "";
  if (!isInteractionSelectionIdField(field)) return issues;
  const cases = Array.isArray(config.cases) ? config.cases : [];
  for (const item of cases) {
    if (!item || typeof item !== "object") continue;
    const caseId = typeof (item as { id?: unknown }).id === "string" ? (item as { id: string }).id : "case";
    checkValue(field, (item as { value?: unknown }).value, caseId);
  }

  return issues;
}
