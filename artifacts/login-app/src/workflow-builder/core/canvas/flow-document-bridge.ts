/**
 * Document → React Flow display bridge.
 *
 * Ownership (Sprint 5.6):
 * - Maps **persistent document nodes** to React Flow node props (id, type, position, data, selected).
 * - Does not read or write RF runtime fields (`measured`, `dimensions`, `handleBounds`, dragging).
 * - Controlled nodes are seeded from this output via `seedControlledNodesFromDocument`.
 */
import type { Node } from "@xyflow/react";
import type { WorkflowNodeData } from "../../components/nodes/workflow-node-card";
import type { BuilderEdge, BuilderNode } from "../types";
import { resolveBranchEdgeStyle } from "../logic/branch-utils";
import { getWorkflowNodeDefinition } from "../node-registry";

export type ValidationHighlightOptions = {
  nodeSeverity: Map<string, "error" | "warning">;
  edgeIds: Set<string>;
  activeNodeIds: Set<string>;
  activeEdgeIds: Set<string>;
};

export function documentNodeSignature(
  nodes: Array<{ id: string; position: { x: number; y: number } }>,
): string {
  return nodes.map((node) => `${node.id}:${node.position.x},${node.position.y}`).join("|");
}

export function documentToFlowNodes(
  nodes: BuilderNode[],
  selectedNodeIds: string[],
  nodeText: (nodeId: string, field: "displayName" | "description", fallback: string) => string,
  onQuickAdd: WorkflowNodeData["onQuickAdd"],
  validationHighlight?: ValidationHighlightOptions,
): Node<WorkflowNodeData>[] {
  const selectedIds = new Set(selectedNodeIds);
  return nodes.map((node) => {
    const definition = getWorkflowNodeDefinition(node.type);
    const label = nodeText(definition.id, "displayName", definition.displayName);
    const subtitle =
      typeof node.config.message === "string"
        ? node.config.message
        : typeof node.config.question === "string"
          ? node.config.question
          : typeof node.config.label === "string"
            ? node.config.label
            : nodeText(definition.id, "description", definition.description);
    const validationSeverity = validationHighlight?.nodeSeverity.get(node.id);
    const validationActive = validationHighlight?.activeNodeIds.has(node.id) ?? false;
    return {
      id: node.id,
      type: "workflowNode",
      position: node.position,
      selected: selectedIds.has(node.id),
      data: {
        label,
        nodeType: node.type,
        subtitle,
        executionStatus: "ready",
        onQuickAdd,
        validationSeverity,
        validationActive,
      },
    };
  });
}

export function documentToFlowEdges(
  nodes: BuilderNode[],
  edges: BuilderEdge[],
  localizeBranchLabel: (label: string) => string,
  validationHighlight?: ValidationHighlightOptions,
) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  return edges.flatMap((edge) => {
    const sourceNode = nodesById.get(edge.source);
    const targetNode = nodesById.get(edge.target);
    if (!sourceNode || !targetNode) return [];

    const sourceDef = getWorkflowNodeDefinition(sourceNode.type);
    const targetDef = getWorkflowNodeDefinition(targetNode.type);
    if (!sourceDef.allowOutgoing || !targetDef.allowIncoming) return [];

    const branchStyle = resolveBranchEdgeStyle(sourceNode, edge);
    const isValidationEdge = validationHighlight?.edgeIds.has(edge.id) ?? false;
    const isActiveValidationEdge = validationHighlight?.activeEdgeIds.has(edge.id) ?? false;
    const validationStroke = isActiveValidationEdge ? "#ef4444" : isValidationEdge ? "#f87171" : branchStyle.stroke;
    const validationStrokeWidth = isActiveValidationEdge ? 3.5 : isValidationEdge ? 3 : 2.5;
    const validationStrokeDasharray = isValidationEdge ? "6 4" : undefined;
    return [
      {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: "source",
        targetHandle: "target",
        animated: !isValidationEdge,
        label: localizeBranchLabel(branchStyle.label ?? ""),
        labelStyle: { fill: validationStroke, fontWeight: 600 },
        style: {
          strokeWidth: validationStrokeWidth,
          stroke: validationStroke,
          ...(validationStrokeDasharray ? { strokeDasharray: validationStrokeDasharray } : {}),
        },
      },
    ];
  });
}
