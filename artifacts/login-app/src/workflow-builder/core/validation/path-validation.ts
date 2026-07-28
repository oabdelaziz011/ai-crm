import { validateExecutionPaths } from "@workspace/automation-platform";
import { getWorkflowNodeDefinition } from "../node-registry";
import { resolveBranchEdgeStyle } from "../logic/branch-utils";
import type { BuilderNodeType, ValidationIssue, WorkflowDocument } from "../types";

const RESUMABLE_CHECKPOINT_NODE_TYPES = new Set<BuilderNodeType>([
  "ask_question",
  "wait_for_reply",
  "date_picker",
  "buttons",
  "list",
]);

function toExecutionGraph(document: WorkflowDocument) {
  const nodeById = new Map(document.nodes.map((node) => [node.id, node]));

  const nodes = document.nodes.map((node) => {
    const definition = getWorkflowNodeDefinition(node.type);
    return {
      id: node.id,
      label: definition.displayName,
      isTrigger: node.type === "start",
      isTerminal: !definition.allowOutgoing,
      isResumableCheckpoint: RESUMABLE_CHECKPOINT_NODE_TYPES.has(node.type),
    };
  });

  const edges = document.edges.map((edge) => {
    const sourceNode = nodeById.get(edge.source);
    const branchStyle = resolveBranchEdgeStyle(sourceNode?.type, edge);
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      branchKey: edge.branchKey,
      branchLabel: edge.branchLabel ?? branchStyle.label,
    };
  });

  return { nodes, edges };
}

export function validateExecutionPathsForDocument(document: WorkflowDocument): ValidationIssue[] {
  if (document.nodes.length === 0) return [];

  return validateExecutionPaths(toExecutionGraph(document)).map((issue) => ({
    id: issue.id,
    message: issue.message,
    nodeId: issue.nodeId,
    severity: issue.severity,
    branchLabel: issue.branchLabel,
    kind: issue.kind,
    affectedNodeIds: issue.affectedNodeIds,
    affectedEdgeIds: issue.affectedEdgeIds,
    pathNodeIds: issue.pathNodeIds,
    pathEdgeIds: issue.pathEdgeIds,
    suggestedFixKeys: issue.suggestedFixKeys,
    focusNodeId: issue.focusNodeId,
  }));
}

export function buildValidationHighlightIndex(issues: ValidationIssue[], activeIssueId: string | null) {
  const nodeSeverity = new Map<string, "error" | "warning">();
  const edgeIds = new Set<string>();
  const activeIssue = issues.find((issue) => issue.id === activeIssueId) ?? null;

  for (const issue of issues) {
    const nodeIds = issue.affectedNodeIds ?? (issue.nodeId ? [issue.nodeId] : []);
    for (const nodeId of nodeIds) {
      const existing = nodeSeverity.get(nodeId);
      if (!existing || (existing === "warning" && issue.severity === "error")) {
        nodeSeverity.set(nodeId, issue.severity);
      }
    }
    for (const edgeId of issue.affectedEdgeIds ?? []) {
      edgeIds.add(edgeId);
    }
  }

  if (activeIssue) {
    for (const nodeId of activeIssue.affectedNodeIds ?? (activeIssue.nodeId ? [activeIssue.nodeId] : [])) {
      nodeSeverity.set(nodeId, activeIssue.severity);
    }
    for (const edgeId of activeIssue.affectedEdgeIds ?? []) {
      edgeIds.add(edgeId);
    }
  }

  return {
    nodeSeverity,
    edgeIds,
    activeNodeIds: new Set(
      activeIssue?.affectedNodeIds ?? (activeIssue?.nodeId ? [activeIssue.nodeId] : []),
    ),
    activeEdgeIds: new Set(activeIssue?.affectedEdgeIds ?? []),
  };
}
