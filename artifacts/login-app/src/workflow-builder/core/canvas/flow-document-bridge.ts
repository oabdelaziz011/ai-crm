/**
 * Structural document → React Flow bridge.
 *
 * P4.2: Projection uses topology + geometry only.
 * Presentation and validation are patched by dedicated canvas sync layers.
 */
import type { Edge, Node } from "@xyflow/react";
import type { WorkflowNodeData } from "../../components/nodes/workflow-node-card";
import type { BuilderEdge, BuilderNode, BuilderNodeType } from "../types";
import { resolveBranchEdgeStyle } from "../logic/branch-utils";
import { getWorkflowNodeDefinition } from "../node-registry";

/** Canvas slice node — sufficient for structural graph projection. */
export type StructuralCanvasNode = Pick<BuilderNode, "id" | "type" | "position">;

export type WorkflowEdgeData = {
  branchKey?: string;
  branchLabel?: string;
  sourceNodeType: BuilderNodeType;
  baseStroke: string;
};

export type WorkflowFlowEdge = Edge<WorkflowEdgeData>;

export function documentNodeSignature(
  nodes: Array<{ id: string; position: { x: number; y: number } }>,
): string {
  return nodes.map((node) => `${node.id}:${node.position.x},${node.position.y}`).join("|");
}

export function documentToFlowNodes(
  nodes: StructuralCanvasNode[],
  selectedNodeIds: string[],
  onQuickAdd: WorkflowNodeData["onQuickAdd"],
): Node<WorkflowNodeData>[] {
  const selectedIds = new Set(selectedNodeIds);
  return nodes.map((node) => ({
    id: node.id,
    type: "workflowNode",
    position: node.position,
    selected: selectedIds.has(node.id),
    data: {
      label: "",
      nodeType: node.type,
      subtitle: "",
      executionStatus: "ready",
      onQuickAdd,
    },
  }));
}

export function documentToFlowEdges(
  nodes: StructuralCanvasNode[],
  edges: BuilderEdge[],
): WorkflowFlowEdge[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  return edges.flatMap((edge) => {
    const sourceNode = nodesById.get(edge.source);
    const targetNode = nodesById.get(edge.target);
    if (!sourceNode || !targetNode) return [];

    const sourceDef = getWorkflowNodeDefinition(sourceNode.type);
    const targetDef = getWorkflowNodeDefinition(targetNode.type);
    if (!sourceDef.allowOutgoing || !targetDef.allowIncoming) return [];

    const branchStyle = resolveBranchEdgeStyle(sourceNode.type, edge);
    return [
      {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: "source",
        targetHandle: "target",
        animated: true,
        label: branchStyle.label ?? "",
        labelStyle: { fill: branchStyle.stroke, fontWeight: 600 },
        style: {
          strokeWidth: 2.5,
          stroke: branchStyle.stroke,
        },
        data: {
          branchKey: edge.branchKey,
          branchLabel: edge.branchLabel,
          sourceNodeType: sourceNode.type,
          baseStroke: branchStyle.stroke,
        },
      },
    ];
  });
}
