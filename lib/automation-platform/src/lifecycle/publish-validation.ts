import type { WorkflowGraphSnapshot, WorkflowPublishValidationIssue } from "./types.js";

function readBuilderType(node: WorkflowGraphSnapshot["nodes"][number]): string | null {
  const builderType = node.config.builderType;
  return typeof builderType === "string" ? builderType : null;
}

function nodeLabel(node: WorkflowGraphSnapshot["nodes"][number]): string {
  return readBuilderType(node) ?? node.type;
}

export function validateWorkflowSnapshot(snapshot: WorkflowGraphSnapshot): WorkflowPublishValidationIssue[] {
  const issues: WorkflowPublishValidationIssue[] = [];
  const nodes = snapshot.nodes;
  const edges = snapshot.edges;

  if (!snapshot.name.trim()) {
    issues.push({ id: "missing-name", message: "Give your workflow a clear name before publishing.", severity: "error" });
  }

  const startNodes = nodes.filter((node) => readBuilderType(node) === "start" || node.type === "trigger");
  const endNodes = nodes.filter((node) => readBuilderType(node) === "end" || node.type === "end");

  if (startNodes.length === 0) {
    issues.push({ id: "missing-start", message: "Add a Start step so your workflow knows when to begin.", severity: "error" });
  }
  if (startNodes.length > 1) {
    issues.push({ id: "duplicate-start", message: "Only one Start step is allowed in a workflow.", severity: "error" });
  }
  if (endNodes.length === 0) {
    issues.push({ id: "missing-end", message: "Add an End step so your workflow knows when to finish.", severity: "error" });
  }

  const connected = new Set<string>();
  for (const edge of edges) {
    connected.add(edge.sourceNodeId);
    connected.add(edge.targetNodeId);
  }
  for (const node of nodes) {
    if (nodes.length <= 1) continue;
    if ((readBuilderType(node) === "start" || node.type === "trigger") && !connected.has(node.id)) {
      issues.push({
        id: `isolated-${node.id}`,
        message: "Your Start step is not connected to the rest of your workflow.",
        severity: "error",
      });
    }
    if (!connected.has(node.id) && readBuilderType(node) !== "start" && node.type !== "trigger") {
      issues.push({
        id: `isolated-${node.id}`,
        message: `${nodeLabel(node)} is not connected to the rest of your workflow.`,
        severity: "error",
      });
    }
  }

  for (const node of nodes) {
    if (readBuilderType(node) === "if_else") {
      const outgoing = edges.filter((edge) => edge.sourceNodeId === node.id);
      if (!outgoing.some((edge) => edge.condition.branch === "yes")) {
        issues.push({
          id: `${node.id}-missing-yes`,
          message: "Connect the YES branch on your If / Else step before publishing.",
          severity: "error",
        });
      }
      if (!outgoing.some((edge) => edge.condition.branch === "no")) {
        issues.push({
          id: `${node.id}-missing-no`,
          message: "Connect the NO branch on your If / Else step before publishing.",
          severity: "error",
        });
      }
    }
  }

  for (const node of nodes) {
    const action = typeof node.config.action === "string" ? node.config.action : null;
    if (node.type === "action" && !action) {
      issues.push({
        id: `${node.id}-missing-action`,
        message: `${nodeLabel(node)} has incomplete configuration.`,
        severity: "error",
      });
    }
  }

  return issues;
}

export function hasBlockingPublishIssues(issues: WorkflowPublishValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}
