import type { RuleClause, RuleGroup } from "@workspace/automation-platform";
import { isInteractionSelectionIdField } from "../variables/interaction-variables";
import type { BuilderEdge, BuilderNode, ValidationIssue, WorkflowDocument } from "../types";

export type InteractiveOption = {
  id: string;
  label: string;
};

const INTERACTIVE_NODE_TYPES = new Set(["buttons", "list"]);

function isRuleGroup(entry: RuleClause | RuleGroup): entry is RuleGroup {
  return "combinator" in entry && Array.isArray(entry.rules);
}

function extractSelectionIdFromIfElseConfig(
  config: Record<string, unknown>,
  options?: InteractiveOption[],
): string | null {
  const ruleSet = config.ruleSet;
  if (!ruleSet || typeof ruleSet !== "object") return null;
  const root = (ruleSet as { root?: RuleGroup }).root;
  if (!root) return null;

  const visit = (group: RuleGroup): string | null => {
    for (const entry of group.rules) {
      if (isRuleGroup(entry)) {
        const nested = visit(entry);
        if (nested) return nested;
        continue;
      }
      if (isInteractionSelectionIdField(entry.field) && entry.operator === "equals") {
        if (typeof entry.value === "string" && entry.value.trim()) return entry.value.trim();
      }
      if (entry.field === "conversation.last_button_title" && entry.operator === "equals") {
        const title = typeof entry.value === "string" ? entry.value.trim() : "";
        if (!title) continue;
        const matched = options?.find((option) => option.label === title);
        if (matched) return matched.id;
      }
    }
    return null;
  };

  return visit(root);
}

function isUnconditionalBuilderEdge(edge: BuilderEdge): boolean {
  return !edge.branchKey;
}

function isSwitchNode(node: BuilderNode | undefined): boolean {
  return node?.type === "switch";
}

function hasSwitchRouter(document: WorkflowDocument, interactiveNodeId: string): boolean {
  return document.edges.some((edge) => {
    if (edge.source !== interactiveNodeId) return false;
    const target = document.nodes.find((node) => node.id === edge.target);
    return isSwitchNode(target);
  });
}

function countTaggedOutgoing(document: WorkflowDocument, interactiveNodeId: string): number {
  return document.edges.filter(
    (edge) => edge.source === interactiveNodeId && typeof edge.branchKey === "string" && edge.branchKey.length > 0,
  ).length;
}

export function validateInteractiveRouting(document: WorkflowDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const node of document.nodes) {
    if (!INTERACTIVE_NODE_TYPES.has(node.type)) continue;

    const outgoing = document.edges.filter((edge) => edge.source === node.id);
    if (outgoing.length <= 1) continue;

    if (hasSwitchRouter(document, node.id)) continue;

    const unconditional = outgoing.filter(isUnconditionalBuilderEdge);
    const taggedCount = countTaggedOutgoing(document, node.id);

    if (unconditional.length > 1 || (unconditional.length > 0 && taggedCount === 0)) {
      issues.push({
        id: `${node.id}-interactive-routing`,
        nodeId: node.id,
        nodeType: node.type,
        severity: "error",
        message:
          "Interactive nodes must route through a Switch node. Connect Buttons/List to Switch(conversation.last_button_id) instead of multiple parallel branches.",
        suggestedFixKeys: ["generateInteractiveRouting"],
      });
      continue;
    }

    if (taggedCount > 0 && taggedCount < outgoing.length) {
      issues.push({
        id: `${node.id}-interactive-routing-partial-tags`,
        nodeId: node.id,
        nodeType: node.type,
        severity: "warning",
        message:
          "Some interactive branches are untagged. Tag each branch with a selection id or route through a Switch node.",
      });
    }
  }

  return issues;
}

export function isLegacyParallelIfInteractiveGraph(document: WorkflowDocument, interactiveNodeId: string): boolean {
  const node = document.nodes.find((entry) => entry.id === interactiveNodeId);
  if (!node || !INTERACTIVE_NODE_TYPES.has(node.type)) return false;
  if (hasSwitchRouter(document, interactiveNodeId)) return false;

  const outgoing = document.edges.filter((edge) => edge.source === interactiveNodeId);
  if (outgoing.length <= 1) return false;

  return outgoing.every((edge) => {
    const target = document.nodes.find((entry) => entry.id === edge.target);
    return target?.type === "if_else";
  });
}

export { extractSelectionIdFromIfElseConfig };
