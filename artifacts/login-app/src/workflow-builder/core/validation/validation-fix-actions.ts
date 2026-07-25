import type { ValidationFixAction, ValidationIssue, WorkflowDocument } from "../types";

type FixTemplate = {
  id: string;
  labelKey: string;
  descriptionKey?: string;
  actionType: ValidationFixAction["actionType"];
  payload?: unknown;
};

function labelFor(key: string): string {
  return key;
}

function withLabels(templates: FixTemplate[]): ValidationFixAction[] {
  return templates.map((template) => ({
    id: template.id,
    label: labelFor(template.labelKey),
    labelKey: template.labelKey,
    ...(template.descriptionKey ? { descriptionKey: template.descriptionKey } : {}),
    actionType: template.actionType,
    payload: template.payload,
  }));
}

function pathIssueFixActions(issue: ValidationIssue): ValidationFixAction[] {
  const focusNodeId = issue.focusNodeId ?? issue.nodeId;
  const lastPathNodeId = issue.pathNodeIds?.[issue.pathNodeIds.length - 1] ?? focusNodeId;
  const branchSourceId = issue.nodeId;
  const cycleEdgeIds = issue.affectedEdgeIds ?? [];

  switch (issue.kind) {
    case "dead-end":
      return withLabels([
        {
          id: `${issue.id}-insert-end`,
          labelKey: "workflowBuilder.validationPanel.fixActions.addEnd",
          actionType: "insert_node",
          payload: { nodeType: "end", afterNodeId: focusNodeId },
        },
        {
          id: `${issue.id}-insert-return-menu`,
          labelKey: "workflowBuilder.validationPanel.fixActions.addReturnToMainMenu",
          actionType: "insert_node",
          payload: { nodeType: "return_to_main_menu", afterNodeId: focusNodeId },
        },
        {
          id: `${issue.id}-connect-next`,
          labelKey: "workflowBuilder.validationPanel.fixActions.connectNextStep",
          actionType: "connect_node",
          payload: { sourceNodeId: focusNodeId },
        },
      ]);
    case "branch-dead-end":
    case "path-no-terminal":
      return withLabels([
        {
          id: `${issue.id}-insert-end`,
          labelKey: "workflowBuilder.validationPanel.fixActions.addEnd",
          actionType: "insert_node",
          payload: {
            nodeType: "end",
            afterNodeId: lastPathNodeId,
            branchFromNodeId: branchSourceId,
            branchLabel: issue.branchLabel,
          },
        },
        {
          id: `${issue.id}-insert-return-menu`,
          labelKey: "workflowBuilder.validationPanel.fixActions.addReturnToMainMenu",
          actionType: "insert_node",
          payload: {
            nodeType: "return_to_main_menu",
            afterNodeId: lastPathNodeId,
            branchFromNodeId: branchSourceId,
            branchLabel: issue.branchLabel,
          },
        },
      ]);
    case "non-terminating-cycle":
      return withLabels([
        {
          id: `${issue.id}-connect-terminal`,
          labelKey: "workflowBuilder.validationPanel.fixActions.connectCycleToTerminal",
          actionType: "connect_node",
          payload: { sourceNodeId: focusNodeId, connectToTerminal: true, cycleNodeIds: issue.affectedNodeIds },
        },
        {
          id: `${issue.id}-remove-cycle-edge`,
          labelKey: "workflowBuilder.validationPanel.fixActions.removeCycleConnection",
          actionType: "custom",
          payload: { operation: "remove_cycle_edge", edgeIds: cycleEdgeIds.slice(0, 1) },
        },
      ]);
    case "unreachable":
      return withLabels([
        {
          id: `${issue.id}-connect-workflow`,
          labelKey: "workflowBuilder.validationPanel.fixActions.connectToWorkflow",
          actionType: "connect_node",
          payload: { targetNodeId: focusNodeId },
        },
        {
          id: `${issue.id}-delete-node`,
          labelKey: "workflowBuilder.validationPanel.fixActions.deleteNode",
          actionType: "delete_node",
          payload: { nodeId: focusNodeId },
        },
      ]);
    default:
      return [];
  }
}

function issueSpecificFixActions(issue: ValidationIssue, document: WorkflowDocument): ValidationFixAction[] {
  if (issue.id === "missing-primary-menu") {
    const menuCandidates = document.nodes.filter((node) => node.type === "buttons" || node.type === "list");
    const preferred = menuCandidates[0];
    return withLabels([
      {
        id: `${issue.id}-mark-primary-menu`,
        labelKey: "workflowBuilder.validationPanel.fixActions.markPrimaryMenu",
        actionType: "set_property",
        payload: {
          property: "primaryMenu",
          value: true,
          nodeId: preferred?.id,
          candidateNodeIds: menuCandidates.map((node) => node.id),
        },
      },
    ]);
  }

  if (issue.id === "missing-end") {
    return withLabels([
      {
        id: `${issue.id}-insert-end`,
        labelKey: "workflowBuilder.validationPanel.fixActions.addEnd",
        actionType: "insert_node",
        payload: { nodeType: "end" },
      },
      {
        id: `${issue.id}-insert-return-menu`,
        labelKey: "workflowBuilder.validationPanel.fixActions.addReturnToMainMenu",
        actionType: "insert_node",
        payload: { nodeType: "return_to_main_menu" },
      },
    ]);
  }

  if (issue.id.startsWith("isolated-") && issue.nodeId) {
    return withLabels([
      {
        id: `${issue.id}-connect-workflow`,
        labelKey: "workflowBuilder.validationPanel.fixActions.connectToWorkflow",
        actionType: "connect_node",
        payload: { targetNodeId: issue.nodeId },
      },
    ]);
  }

  return [];
}

export function buildFixActionsForIssue(issue: ValidationIssue, document: WorkflowDocument): ValidationFixAction[] {
  if (issue.kind) {
    const pathFixes = pathIssueFixActions(issue);
    if (pathFixes.length > 0) return pathFixes;
  }
  return issueSpecificFixActions(issue, document);
}

export function enrichValidationIssues(issues: ValidationIssue[], document: WorkflowDocument): ValidationIssue[] {
  return issues.map((issue) => ({
    ...issue,
    fixActions: buildFixActionsForIssue(issue, document),
  }));
}

export function summarizeValidationIssues(issues: ValidationIssue[]) {
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  return {
    errors,
    warnings,
    valid: errors === 0 && warnings === 0,
  };
}
