import type { RuleClause, RuleGroup } from "@workspace/automation-platform";
import { isInteractionSelectionIdField } from "../variables/interaction-variables";
import type { WorkflowDocument } from "../types";

export type NodeConfigPatch = {
  nodeId: string;
  patch: Record<string, unknown>;
};

type SwitchCase = { id: string; label: string; value: string };

function isRuleGroup(entry: RuleClause | RuleGroup): entry is RuleGroup {
  return "combinator" in entry && Array.isArray(entry.rules);
}

function rewriteRuleValue(value: unknown, oldId: string, newId: string): unknown {
  return typeof value === "string" && value === oldId ? newId : value;
}

function rewriteRuleGroup(group: RuleGroup, fieldFilter: (field: string) => boolean, oldId: string, newId: string): RuleGroup {
  let changed = false;
  const rules = group.rules.map((entry) => {
    if (isRuleGroup(entry)) {
      const next = rewriteRuleGroup(entry, fieldFilter, oldId, newId);
      if (next !== entry) changed = true;
      return next;
    }
    if (!fieldFilter(entry.field)) return entry;
    const nextValue = rewriteRuleValue(entry.value, oldId, newId);
    const nextValueTo = rewriteRuleValue(entry.valueTo, oldId, newId);
    if (nextValue === entry.value && nextValueTo === entry.valueTo) return entry;
    changed = true;
    return { ...entry, value: nextValue, valueTo: nextValueTo };
  });
  if (!changed) return group;
  return { ...group, rules };
}

function rewriteIfElseRuleSet(
  config: Record<string, unknown>,
  oldId: string,
  newId: string,
): Record<string, unknown> | null {
  const ruleSet = config.ruleSet;
  if (!ruleSet || typeof ruleSet !== "object") return null;
  const root = (ruleSet as { root?: RuleGroup }).root;
  if (!root) return null;
  const nextRoot = rewriteRuleGroup(root, isInteractionSelectionIdField, oldId, newId);
  if (nextRoot === root) return null;
  return { ruleSet: { ...(ruleSet as object), root: nextRoot } };
}

function rewriteSwitchConfig(
  config: Record<string, unknown>,
  oldId: string,
  newId: string,
): Record<string, unknown> | null {
  const field = typeof config.field === "string" ? config.field : "";
  if (!isInteractionSelectionIdField(field)) return null;
  const cases = Array.isArray(config.cases) ? (config.cases as SwitchCase[]) : [];
  let changed = false;
  const nextCases = cases.map((item) => {
    if (item.value !== oldId) return item;
    changed = true;
    return { ...item, value: newId };
  });
  if (!changed) return null;
  return { cases: nextCases };
}

/**
 * Updates downstream logic nodes that reference an renamed interactive option id.
 * Uses existing UPDATE_NODE_CONFIG patches — no reducer changes.
 */
export function buildInteractiveOptionIdRefactorPatches(
  document: WorkflowDocument,
  sourceNodeId: string,
  oldId: string,
  newId: string,
): NodeConfigPatch[] {
  if (!oldId || !newId || oldId === newId) return [];

  const patches: NodeConfigPatch[] = [];
  for (const node of document.nodes) {
    if (node.id === sourceNodeId) continue;
    if (node.type === "if_else") {
      const patch = rewriteIfElseRuleSet(node.config, oldId, newId);
      if (patch) patches.push({ nodeId: node.id, patch });
      continue;
    }
    if (node.type === "switch") {
      const patch = rewriteSwitchConfig(node.config, oldId, newId);
      if (patch) patches.push({ nodeId: node.id, patch });
    }
  }
  return patches;
}
