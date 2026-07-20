import type { WorkflowGraphSnapshot, WorkflowVersionComparison } from "./types.js";
import { hasBlockingPublishIssues, validateWorkflowSnapshot } from "./publish-validation.js";

function nodeKey(node: WorkflowGraphSnapshot["nodes"][number]): string {
  const builderType = node.config.builderType;
  return typeof builderType === "string" ? builderType : node.type;
}

function connectionKey(edge: WorkflowGraphSnapshot["edges"][number]): string {
  const branch = edge.condition.branch ?? edge.condition.case ?? "";
  return `${edge.sourceNodeId}->${edge.targetNodeId}:${branch}`;
}

export function compareWorkflowSnapshots(
  before: WorkflowGraphSnapshot,
  after: WorkflowGraphSnapshot,
): WorkflowVersionComparison {
  const beforeNodes = new Map(before.nodes.map((node) => [node.id, node]));
  const afterNodes = new Map(after.nodes.map((node) => [node.id, node]));

  const addedNodes = after.nodes.filter((node) => !beforeNodes.has(node.id)).map((node) => nodeKey(node));
  const removedNodes = before.nodes.filter((node) => !afterNodes.has(node.id)).map((node) => nodeKey(node));

  const changedNodeProperties = after.nodes.flatMap((node) => {
    const previous = beforeNodes.get(node.id);
    if (!previous) return [];
    if (JSON.stringify(previous.config) === JSON.stringify(node.config)) return [];
    return [{ nodeId: node.id, label: nodeKey(node) }];
  });

  const beforeConnections = new Set(before.edges.map(connectionKey));
  const afterConnections = new Set(after.edges.map(connectionKey));

  const addedConnections = [...afterConnections].filter((key) => !beforeConnections.has(key));
  const removedConnections = [...beforeConnections].filter((key) => !afterConnections.has(key));

  const beforeErrors = validateWorkflowSnapshot(before).filter((issue) => issue.severity === "error").length;
  const afterErrors = validateWorkflowSnapshot(after).filter((issue) => issue.severity === "error").length;

  return {
    addedNodes,
    removedNodes,
    changedNodeProperties,
    addedConnections,
    removedConnections,
    changedConnections: after.edges
      .filter((edge) => {
        const previous = before.edges.find(
          (item) => item.sourceNodeId === edge.sourceNodeId && item.targetNodeId === edge.targetNodeId,
        );
        return previous && JSON.stringify(previous.condition) !== JSON.stringify(edge.condition);
      })
      .map(connectionKey),
    validationDelta: { beforeErrors, afterErrors },
  };
}

export function summarizeComparison(comparison: WorkflowVersionComparison): string[] {
  const lines: string[] = [];
  if (comparison.addedNodes.length) lines.push(`${comparison.addedNodes.length} step(s) added`);
  if (comparison.removedNodes.length) lines.push(`${comparison.removedNodes.length} step(s) removed`);
  if (comparison.changedNodeProperties.length) lines.push(`${comparison.changedNodeProperties.length} step setting(s) changed`);
  if (comparison.addedConnections.length || comparison.removedConnections.length || comparison.changedConnections.length) {
    lines.push("Connections changed");
  }
  if (comparison.validationDelta.afterErrors > comparison.validationDelta.beforeErrors) {
    lines.push("New validation issues introduced");
  }
  if (lines.length === 0) lines.push("No structural differences detected");
  return lines;
}
