import { detectCycle, findIsolatedNodeIds } from "../connection-rules";
import { getWorkflowNodeDefinition } from "../node-registry";
import { validateBranching } from "./branch-validation";
import type { ValidationIssue, WorkflowDocument } from "../types";

export function validateWorkflow(document: WorkflowDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const startNodes = document.nodes.filter((node) => node.type === "start");
  const endNodes = document.nodes.filter((node) => node.type === "end");

  if (startNodes.length === 0) {
    issues.push({
      id: "missing-start",
      message: "Add a Start step so your workflow knows when to begin.",
      severity: "error",
    });
  }

  if (startNodes.length > 1) {
    for (const node of startNodes.slice(1)) {
      issues.push({
        id: `duplicate-start-${node.id}`,
        nodeId: node.id,
        message: "Only one Start step is allowed in a workflow.",
        severity: "error",
      });
    }
  }

  if (endNodes.length === 0) {
    issues.push({
      id: "missing-end",
      message: "Add an End step so your workflow knows when to finish.",
      severity: "error",
    });
  }

  for (const nodeId of findIsolatedNodeIds(document.nodes, document.edges)) {
    issues.push({
      id: `isolated-${nodeId}`,
      nodeId,
      message: "This step is not connected to the rest of your workflow.",
      severity: "error",
    });
  }

  if (detectCycle(document.nodes, document.edges)) {
    issues.push({
      id: "cycle-detected",
      message: "Your workflow loops back on itself. Remove the loop before publishing.",
      severity: "error",
    });
  }

  for (const node of document.nodes) {
    const definition = getWorkflowNodeDefinition(node.type);
    issues.push(...definition.validate(node.config, node.id));
  }

  issues.push(...validateBranching(document));

  if (!document.name.trim()) {
    issues.push({
      id: "missing-name",
      message: "Give your workflow a clear name before publishing.",
      severity: "error",
    });
  }

  return issues;
}

export function hasBlockingValidationIssues(issues: ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}
