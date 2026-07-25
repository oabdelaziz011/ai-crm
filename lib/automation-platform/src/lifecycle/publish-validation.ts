import type { WorkflowGraphSnapshot, WorkflowPublishValidationIssue } from "./types.js";
import { validateExecutionPaths } from "./path-validation.js";

function readBuilderType(node: WorkflowGraphSnapshot["nodes"][number]): string | null {
  const builderType = node.config.builderType;
  return typeof builderType === "string" ? builderType : null;
}

function nodeLabel(node: WorkflowGraphSnapshot["nodes"][number]): string {
  return readBuilderType(node) ?? node.type;
}

function isTerminalSnapshotNode(node: WorkflowGraphSnapshot["nodes"][number]): boolean {
  const builderType = readBuilderType(node);
  return builderType === "end" || builderType === "return_to_main_menu" || node.type === "end";
}

function isTriggerSnapshotNode(node: WorkflowGraphSnapshot["nodes"][number]): boolean {
  return readBuilderType(node) === "start" || node.type === "trigger";
}

function snapshotToExecutionGraph(snapshot: WorkflowGraphSnapshot) {
  return {
    nodes: snapshot.nodes.map((node) => ({
      id: node.id,
      label: nodeLabel(node),
      isTrigger: isTriggerSnapshotNode(node),
      isTerminal: isTerminalSnapshotNode(node),
    })),
    edges: snapshot.edges.map((edge) => {
      const branchKey = typeof edge.condition.branch === "string" ? edge.condition.branch : undefined;
      return {
        id: edge.id,
        source: edge.sourceNodeId,
        target: edge.targetNodeId,
        branchKey,
        branchLabel:
          branchKey === "yes" ? "YES" : branchKey === "no" ? "NO" : branchKey === "default" ? "Default" : branchKey,
      };
    }),
  };
}

export function validateWorkflowSnapshot(snapshot: WorkflowGraphSnapshot): WorkflowPublishValidationIssue[] {
  const issues: WorkflowPublishValidationIssue[] = [];
  const nodes = snapshot.nodes;
  const edges = snapshot.edges;

  if (!snapshot.name.trim()) {
    issues.push({ id: "missing-name", message: "Give your workflow a clear name before publishing.", severity: "error" });
  }

  const startNodes = nodes.filter((node) => readBuilderType(node) === "start" || node.type === "trigger");
  const terminalNodes = nodes.filter(isTerminalSnapshotNode);

  if (startNodes.length === 0) {
    issues.push({ id: "missing-start", message: "Add a Start step so your workflow knows when to begin.", severity: "error" });
  }
  if (startNodes.length > 1) {
    issues.push({ id: "duplicate-start", message: "Only one Start step is allowed in a workflow.", severity: "error" });
  }
  if (terminalNodes.length === 0) {
    issues.push({
      id: "missing-end",
      message: "Add an End step or Return to Main Menu step so your workflow knows when to finish.",
      severity: "error",
    });
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

  const primaryMenuNodes = nodes.filter((node) => {
    const builderType = readBuilderType(node);
    return (builderType === "buttons" || builderType === "list") && node.config.primaryMenu === true;
  });
  if (primaryMenuNodes.length > 1) {
    issues.push({
      id: "duplicate-primary-menu",
      message: "Only one Buttons or List step can be marked as the Primary Menu.",
      severity: "error",
    });
  }
  const hasReturnToMainMenu = nodes.some(
    (node) => readBuilderType(node) === "return_to_main_menu" || node.config.action === "return_to_main_menu",
  );
  if (hasReturnToMainMenu && primaryMenuNodes.length === 0) {
    issues.push({
      id: "missing-primary-menu",
      message: "Mark one Buttons or List step as the Primary Menu before using Return to Main Menu.",
      severity: "error",
    });
  }

  issues.push(...validateExecutionPaths(snapshotToExecutionGraph(snapshot)));
  issues.push(...validateInteractiveRoutingSnapshot(snapshot));

  return issues;
}

function readBuilderTypeForRouting(node: WorkflowGraphSnapshot["nodes"][number]): string | null {
  const builderType = node.config.builderType;
  return typeof builderType === "string" ? builderType : null;
}

function validateInteractiveRoutingSnapshot(snapshot: WorkflowGraphSnapshot): WorkflowPublishValidationIssue[] {
  const issues: WorkflowPublishValidationIssue[] = [];

  for (const node of snapshot.nodes) {
    const builderType = readBuilderTypeForRouting(node);
    if (builderType !== "buttons" && builderType !== "list") continue;

    const outgoing = snapshot.edges.filter((edge) => edge.sourceNodeId === node.id);
    if (outgoing.length <= 1) continue;

    const hasSwitchRouter = outgoing.some((edge) => {
      const target = snapshot.nodes.find((entry) => entry.id === edge.targetNodeId);
      if (!target) return false;
      return readBuilderTypeForRouting(target) === "switch" || target.config.mode === "switch";
    });
    if (hasSwitchRouter) continue;

    const unconditional = outgoing.filter(
      (edge) => !edge.condition.branch && !edge.condition.case && !edge.condition.selectionId,
    );
    const tagged = outgoing.filter(
      (edge) =>
        typeof edge.condition.case === "string" ||
        typeof edge.condition.selectionId === "string" ||
        typeof edge.condition.branch === "string",
    );

    if (unconditional.length > 1 || (unconditional.length > 0 && tagged.length === 0)) {
      issues.push({
        id: `${node.id}-interactive-routing`,
        message:
          "Interactive nodes must route through a Switch node. Connect Buttons/List to Switch(conversation.last_button_id) instead of multiple parallel branches.",
        severity: "error",
      });
    }
  }

  return issues;
}

export function hasBlockingPublishIssues(issues: WorkflowPublishValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}
