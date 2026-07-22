import type { Node, NodeChange } from "@xyflow/react";
import type { WorkflowNodeData } from "../components/nodes/workflow-node-card";

export type CanvasSyncTraceNode = Node<WorkflowNodeData>;

export type CanvasSyncTraceHandles = {
  handleNodesChange: (changes: NodeChange[]) => void;
  getStoreNodes: () => CanvasSyncTraceNode[];
};

export type CanvasSyncTraceAdapter = {
  setNodes: (
    caller: string,
    reason: string,
    before: CanvasSyncTraceNode[] | undefined,
    after: CanvasSyncTraceNode[] | undefined,
    meta?: Record<string, unknown>,
  ) => void;
  onNodesChange: (
    caller: string,
    reason: string,
    changes: NodeChange[],
    nodeCountBefore: number,
    meta?: Record<string, unknown>,
  ) => void;
  handleNodesChange: (
    reason: string,
    changes: NodeChange[],
    nodeCount: number,
    meta?: Record<string, unknown>,
  ) => void;
  syncEffect: (reason: string, nodeCount: number, skipped: boolean, meta?: Record<string, unknown>) => void;
  seedControlledNodesFromDocument: (
    caller: string,
    reason: string,
    before: CanvasSyncTraceNode[],
    flowNodes: CanvasSyncTraceNode[],
    after: CanvasSyncTraceNode[],
  ) => CanvasSyncTraceNode[];
  nodesPropRender: (
    renderCount: number,
    before: CanvasSyncTraceNode[] | undefined,
    after: CanvasSyncTraceNode[] | undefined,
  ) => void;
  storeUpdaterProp: (
    before: CanvasSyncTraceNode[] | undefined,
    after: CanvasSyncTraceNode[] | undefined,
    meta?: Record<string, unknown>,
  ) => void;
  registerCanvasHandles: (handles: CanvasSyncTraceHandles) => void;
};
