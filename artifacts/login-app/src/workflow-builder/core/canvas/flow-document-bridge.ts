/**
 * Structural document → React Flow bridge.
 *
 * P4.2: Projection uses topology + geometry only.
 * Presentation and validation are patched by dedicated canvas sync layers.
 */
import type { Edge, Node } from "@xyflow/react";
import type { WorkflowNodeData } from "../../components/nodes/workflow-node-card";
import type { BuilderEdge, BuilderNode, BuilderNodeType } from "../types";
import { resolveBranchEdgeStyle, switchCaseSourceHandleId } from "../logic/branch-utils";
import { getWorkflowNodeDefinition } from "../node-registry";

/** Canvas slice node — sufficient for structural graph projection. */
export type StructuralCanvasNode = Pick<BuilderNode, "id" | "type" | "position"> & {
  branchPorts?: Array<{ key: string; label: string }>;
};

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
  return nodes.map((node) => {
    const definition = getWorkflowNodeDefinition(node.type);
    return {
      id: node.id,
      type: "workflowNode",
      position: node.position,
      selected: selectedIds.has(node.id),
      data: {
        // Seed a readable label immediately; presentation sync overwrites with i18n.
        label: definition.displayName,
        nodeType: node.type,
        subtitle: "",
        executionStatus: "ready" as const,
        onQuickAdd,
        branchPorts: node.branchPorts,
      },
    };
  });
}

export function documentToFlowEdges(
  nodes: StructuralCanvasNode[],
  edges: BuilderEdge[],
  selectedEdgeIds: readonly string[] = [],
): WorkflowFlowEdge[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const selectedIds = new Set(selectedEdgeIds);
  return edges.flatMap((edge) => {
    const sourceNode = nodesById.get(edge.source);
    const targetNode = nodesById.get(edge.target);
    if (!sourceNode || !targetNode) return [];

    const sourceDef = getWorkflowNodeDefinition(sourceNode.type);
    const targetDef = getWorkflowNodeDefinition(targetNode.type);
    if (!sourceDef.allowOutgoing || !targetDef.allowIncoming) return [];

    const branchStyle = resolveBranchEdgeStyle(sourceNode.type, edge);
    const sourceHandle =
      sourceNode.type === "switch" && edge.branchKey
        ? switchCaseSourceHandleId(edge.branchKey)
        : "source";
    const selected = selectedIds.has(edge.id);
    const stroke = selected ? "#0ea5e9" : branchStyle.stroke;
    return [
      {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle,
        targetHandle: "target",
        animated: !selected,
        selectable: true,
        focusable: true,
        interactionWidth: 28,
        selected,
        label: branchStyle.label ?? "",
        labelStyle: { fill: stroke, fontWeight: 600 },
        style: {
          strokeWidth: selected ? 3.5 : 2.5,
          stroke,
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
