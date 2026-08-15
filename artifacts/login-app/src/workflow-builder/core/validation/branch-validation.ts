import { validateRuleSet, type CompiledRuleSet } from "@workspace/automation-platform";
import { getWorkflowNodeDefinition } from "../node-registry";
import type { BuilderEdge, BuilderNode, ValidationIssue, WorkflowDocument } from "../types";

function readRuleSet(config: Record<string, unknown>): CompiledRuleSet | null {
  const ruleSet = config.ruleSet;
  if (!ruleSet || typeof ruleSet !== "object") return null;
  const root = (ruleSet as CompiledRuleSet).root;
  if (!root || typeof root !== "object") return null;
  return ruleSet as CompiledRuleSet;
}

export function validateBranching(document: WorkflowDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodeById = new Map(document.nodes.map((node) => [node.id, node]));

  for (const node of document.nodes) {
    const outgoing = document.edges.filter((edge) => edge.source === node.id);

    if (node.type === "if_else") {
      const yes = outgoing.some((edge) => edge.branchKey === "yes");
      const no = outgoing.some((edge) => edge.branchKey === "no");
      if (!yes) {
        issues.push({
          id: `${node.id}-missing-yes`,
          nodeId: node.id,
          message: "Connect the YES branch so customers who match your rules know what happens next.",
          severity: "error",
        });
      }
      if (!no) {
        issues.push({
          id: `${node.id}-missing-no`,
          nodeId: node.id,
          message: "Connect the NO branch so customers who do not match still have a clear next step.",
          severity: "error",
        });
      }

      const ruleSet = readRuleSet(node.config);
      if (!ruleSet) {
        issues.push({
          id: `${node.id}-missing-rules`,
          nodeId: node.id,
          message: "Add at least one rule before publishing this If / Else step.",
          severity: "error",
        });
      } else {
        for (const message of validateRuleSet(ruleSet)) {
          issues.push({
            id: `${node.id}-rule-${issues.length}`,
            nodeId: node.id,
            message,
            severity: "error",
          });
        }
      }
    }

    if (node.type === "switch") {
      const field = typeof node.config.field === "string" ? node.config.field.trim() : "";
      if (!field) {
        issues.push({
          id: `${node.id}-missing-field`,
          nodeId: node.id,
          message: "Choose a field for your Switch step.",
          severity: "error",
        });
      }

      const cases = Array.isArray(node.config.cases) ? node.config.cases : [];
      if (cases.length === 0) {
        issues.push({
          id: `${node.id}-missing-cases`,
          nodeId: node.id,
          message: "Add at least one case before publishing your Switch step.",
          severity: "error",
        });
      }

      const values = new Set<string>();
      for (const item of cases) {
        const value = String((item as { value?: unknown }).value ?? "");
        if (values.has(value)) {
          issues.push({
            id: `${node.id}-duplicate-case`,
            nodeId: node.id,
            message: "Each Switch case must use a unique value.",
            severity: "error",
          });
          break;
        }
        values.add(value);
      }

      for (const item of cases) {
        const valueKey = String((item as { value?: unknown }).value ?? "").trim();
        const caseId = String((item as { id?: string }).id ?? "").trim();
        const branchKey = valueKey || caseId;
        if (!branchKey) continue;
        if (!outgoing.some((edge) => edge.branchKey === branchKey || (caseId !== "" && edge.branchKey === caseId))) {
          const rawLabel = typeof (item as { label?: string }).label === "string" ? (item as { label: string }).label.trim() : "";
          const label = rawLabel || valueKey || "Case";
          issues.push({
            id: `${node.id}-missing-case-${branchKey}`,
            nodeId: node.id,
            message: `Connect the "${label}" branch.`,
            severity: "error",
            branchLabel: label,
          });
        }
      }

      if (node.config.includeDefault !== false && !outgoing.some((edge) => edge.branchKey === "default")) {
        issues.push({
          id: `${node.id}-missing-default`,
          nodeId: node.id,
          message: "Connect the Default branch for values that do not match any case.",
          severity: "error",
        });
      }
    }

    if (node.type === "merge") {
      const incoming = document.edges.filter((edge) => edge.target === node.id);
      if (incoming.length < 2) {
        issues.push({
          id: `${node.id}-merge-paths`,
          nodeId: node.id,
          message: "Merge steps should receive at least two incoming paths.",
          severity: "warning",
        });
      }
    }
  }

  for (const edge of document.edges) {
    const source = nodeById.get(edge.source);
    if (!source) continue;
    const definition = getWorkflowNodeDefinition(source.type);
    if (definition.maxOutgoing != null) {
      const outgoing = document.edges.filter((item) => item.source === source.id);
      if (outgoing.length > definition.maxOutgoing) {
        issues.push({
          id: `${source.id}-too-many-outgoing`,
          nodeId: source.id,
          message: `${definition.displayName} has more outgoing branches than allowed.`,
          severity: "error",
          nodeType: source.type,
        });
      }
    }
  }

  return issues;
}

export function findDisconnectedBranchTargets(nodes: BuilderNode[], edges: BuilderEdge[]): string[] {
  const connected = new Set<string>();
  for (const edge of edges) {
    connected.add(edge.source);
    connected.add(edge.target);
  }
  return nodes.filter((node) => node.type !== "start" && !connected.has(node.id)).map((node) => node.id);
}
