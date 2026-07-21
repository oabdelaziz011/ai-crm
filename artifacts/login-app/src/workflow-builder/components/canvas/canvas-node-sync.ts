import type { Node } from "@xyflow/react";
import type { BuilderNodeType } from "../../core/types";

export {
  documentNodeSignature,
  documentToFlowNodes,
  positionUpdatesFromNodeChanges,
} from "../../core/canvas/flow-document-bridge";

/** @deprecated Drag-only dual state removed — document is always the RF node source. */
export function resolveCanvasFlowNodes<T>(isDragging: boolean, documentNodes: T[], dragNodes: T[]): T[] {
  return isDragging ? dragNodes : documentNodes;
}

export type DragPositionChange = {
  type: "position";
  id: string;
  position: { x: number; y: number };
  dragging?: boolean;
};

export function extractDragCommitPositions(changes: DragPositionChange[]): Array<{ id: string; x: number; y: number }> {
  if (changes.some((change) => change.type === "position" && change.dragging)) {
    return [];
  }
  return changes.flatMap((change) => {
    if (change.type !== "position" || change.dragging) return [];
    return [{ id: change.id, x: change.position.x, y: change.position.y }];
  });
}

type FlowNodeData = {
  label: string;
  nodeType: BuilderNodeType;
  subtitle?: string;
  executionStatus?: string;
};

type FlowNode = Node<FlowNodeData>;

function flowNodeDataEqual(existing: FlowNodeData, next: FlowNodeData): boolean {
  return (
    existing.label === next.label &&
    existing.nodeType === next.nodeType &&
    existing.subtitle === next.subtitle &&
    existing.executionStatus === next.executionStatus
  );
}

/** Merge document-derived nodes into RF state; return `current` when nothing semantically changed. */
export function mergeFlowNodesIntoCurrent(current: FlowNode[], flowNodes: FlowNode[]): FlowNode[] {
  if (current.length !== flowNodes.length) {
    return buildMergedNodes(current, flowNodes);
  }

  const currentById = new Map(current.map((node) => [node.id, node]));
  let changed = false;
  const next: FlowNode[] = [];

  for (const flowNode of flowNodes) {
    const existing = currentById.get(flowNode.id);
    if (!existing) {
      return buildMergedNodes(current, flowNodes);
    }

    const positionUnchanged =
      existing.position.x === flowNode.position.x && existing.position.y === flowNode.position.y;
    const selectedUnchanged = existing.selected === flowNode.selected;
    const dataUnchanged = flowNodeDataEqual(existing.data, flowNode.data);

    if (positionUnchanged && selectedUnchanged && dataUnchanged) {
      next.push(existing);
      continue;
    }

    changed = true;
    next.push({
      ...existing,
      position: flowNode.position,
      selected: flowNode.selected,
      data: dataUnchanged ? existing.data : flowNode.data,
    });
  }

  if (!changed) return current;
  return next;
}

function buildMergedNodes(current: FlowNode[], flowNodes: FlowNode[]): FlowNode[] {
  const currentById = new Map(current.map((node) => [node.id, node]));
  return flowNodes.map((flowNode) => {
    const existing = currentById.get(flowNode.id);
    if (!existing) return flowNode;

    const dataUnchanged = flowNodeDataEqual(existing.data, flowNode.data);
    return {
      ...existing,
      position: flowNode.position,
      selected: flowNode.selected,
      data: dataUnchanged ? existing.data : flowNode.data,
    };
  });
}
