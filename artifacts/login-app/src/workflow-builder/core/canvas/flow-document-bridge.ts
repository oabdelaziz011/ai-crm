import { applyNodeChanges, type Node, type NodeChange } from "@xyflow/react";
import type { WorkflowNodeData } from "../../components/nodes/workflow-node-card";
import type { WorkflowBuilderController } from "../../hooks/use-workflow-builder";
import type { BuilderEdge, BuilderNode } from "../types";
import { resolveBranchEdgeStyle } from "../logic/branch-utils";
import { getWorkflowNodeDefinition } from "../node-registry";

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
      },
    };
  });
}

export function documentToFlowEdges(
  nodes: BuilderNode[],
  edges: BuilderEdge[],
  localizeBranchLabel: (label: string) => string,
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
    return [
      {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: "source",
        targetHandle: "target",
        animated: true,
        label: localizeBranchLabel(branchStyle.label ?? ""),
        labelStyle: { fill: branchStyle.stroke, fontWeight: 600 },
        style: { strokeWidth: 2.5, stroke: branchStyle.stroke },
      },
    ];
  });
}

/** Apply RF node changes and return document position updates (drag-only). */
export function positionUpdatesFromNodeChanges(
  changes: NodeChange<Node<WorkflowNodeData>>[],
  currentNodes: Node<WorkflowNodeData>[],
  documentNodes: BuilderNode[],
): { positions: Array<{ id: string; x: number; y: number }>; dragging: boolean } {
  const dragging = changes.some((change) => change.type === "position" && change.dragging);
  const nextNodes = applyNodeChanges(changes, currentNodes) as Node<WorkflowNodeData>[];
  const documentById = new Map(documentNodes.map((node) => [node.id, node.position]));

  const positions = nextNodes.flatMap((node) => {
    const previous = currentNodes.find((entry) => entry.id === node.id);
    if (!previous) return [];
    if (previous.position.x === node.position.x && previous.position.y === node.position.y) return [];

    const authoritative = documentById.get(node.id);
    if (authoritative && authoritative.x === node.position.x && authoritative.y === node.position.y) {
      return [];
    }

    return [{ id: node.id, x: node.position.x, y: node.position.y }];
  });

  return { positions, dragging };
}

export function builderDocumentSnapshot(controller: WorkflowBuilderController) {
  return {
    nodes: controller.state.document.nodes,
    edges: controller.state.document.edges,
    selectedNodeIds: controller.state.selectedNodeIds,
    viewport: controller.state.document.viewport,
    nodeSignature: documentNodeSignature(controller.state.document.nodes),
  };
}
