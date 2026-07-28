import { validateBranching } from "./branch-validation";
import { findIsolatedNodeIds } from "../connection-rules";
import { getWorkflowNodeDefinition } from "../node-registry";
import { validateInteractiveRouting } from "./interactive-routing-validation";
import { validateExecutionPathsForDocument } from "./path-validation";
import { workflowHasTerminalNode } from "./terminal-nodes";
import { enrichValidationIssues } from "./validation-fix-actions";
import type { ValidationIssue, WorkflowDocument } from "../types";

function validatePrimaryMenu(document: WorkflowDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const primaryMenus = document.nodes.filter(
    (node) => (node.type === "buttons" || node.type === "list") && node.config.primaryMenu === true,
  );

  if (primaryMenus.length > 1) {
    for (const node of primaryMenus.slice(1)) {
      issues.push({
        id: `duplicate-primary-menu-${node.id}`,
        nodeId: node.id,
        message: "Only one Buttons or List step can be marked as the Primary Menu.",
        severity: "error",
      });
    }
  }

  const hasReturnToMainMenu = document.nodes.some((node) => node.type === "return_to_main_menu");
  if (hasReturnToMainMenu && primaryMenus.length === 0) {
    issues.push({
      id: "missing-primary-menu",
      message: "Mark one Buttons or List step as the Primary Menu before using Return to Main Menu.",
      severity: "error",
    });
  }

  return issues;
}

/** Graph topology, paths, branches — run when edges or node types change. */
export function validateWorkflowStructure(document: WorkflowDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const startNodes = document.nodes.filter((node) => node.type === "start");

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

  if (!workflowHasTerminalNode(document.nodes)) {
    issues.push({
      id: "missing-end",
      message: "Add an End step or Return to Main Menu step so your workflow knows when to finish.",
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

  issues.push(...validateExecutionPathsForDocument(document));
  issues.push(...validateBranching(document));
  issues.push(...validateInteractiveRouting(document));
  issues.push(...validatePrimaryMenu(document));

  return issues;
}

/** Per-node config validators and document metadata — run on property edits. */
export function validateWorkflowNodeConfigs(document: WorkflowDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const node of document.nodes) {
    const definition = getWorkflowNodeDefinition(node.type);
    issues.push(...definition.validate(node.config, node.id));
  }

  if (!document.name.trim()) {
    issues.push({
      id: "missing-name",
      message: "Give your workflow a clear name before publishing.",
      severity: "error",
    });
  }

  return issues;
}

export function mergeValidationIssues(
  document: WorkflowDocument,
  structural: ValidationIssue[],
  config: ValidationIssue[],
): ValidationIssue[] {
  return enrichValidationIssues([...structural, ...config], document);
}

export function validateWorkflow(document: WorkflowDocument): ValidationIssue[] {
  return mergeValidationIssues(
    document,
    validateWorkflowStructure(document),
    validateWorkflowNodeConfigs(document),
  );
}

export function hasBlockingValidationIssues(issues: ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}
