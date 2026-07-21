import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  SelectionMode,
  applyEdgeChanges,
  useNodesState,
  useReactFlow,
  type Connection,
  type NodeChange,
  type OnConnect,
  type OnSelectionChangeParams,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { canConnect } from "../../core/connection-rules";
import { rememberCanvasSelection, selectionKey } from "../../core/canvas/canvas-selection-guard";
import { getLiveSelectedNodeIdsRef } from "../../core/canvas/canvas-selection-bridge";
import {
  documentNodeSignature,
  documentToFlowEdges,
  documentToFlowNodes,
} from "../../core/canvas/flow-document-bridge";
import { listNodeRenderers, registerDefaultNodeRenderers } from "../../core/registry/node-renderer-registry";
import { createEdgeFromNodes } from "../../core/state/builder-reducer";
import type { WorkflowBuilderController } from "../../hooks/use-workflow-builder";
import type { BuilderNodeType } from "../../core/types";
import { CanvasEmptyState } from "./canvas-empty-state";
import { mergeFlowNodesIntoCurrent } from "./canvas-node-sync";
import { quickAddPosition, type WorkflowNodeData } from "../nodes/workflow-node-card";
import { useWorkflowBuilderI18n } from "@/workflow-builder/hooks/use-workflow-builder-i18n";
import { useCanvasContainerSize } from "../../hooks/use-canvas-container-size";

registerDefaultNodeRenderers();

/** Tracks which flows already received the one-time fitView for empty viewport. */
const fitViewAppliedFlowIds = new Set<string>();

type WorkflowCanvasProps = {
  controller: WorkflowBuilderController;
};

function localizeDefaultBranchLabel(label: string, branchLabel: (key: string, fallback?: string) => string): string {
  if (label === "Default") return branchLabel("default", label);
  if (label === "Case") return branchLabel("case", label);
  if (label === "No") return branchLabel("no", label);
  if (label === "Yes") return branchLabel("yes", label);
  return label;
}

type WorkflowCanvasInnerProps = WorkflowCanvasProps & {
  width: number;
  height: number;
};

export function WorkflowCanvasInner({ controller, width, height }: WorkflowCanvasInnerProps) {
  const { fitView, getNodes, getViewport } = useReactFlow();
  const { nodeText, branchLabel } = useWorkflowBuilderI18n();
  const dispatchRef = useRef(controller.dispatch);
  dispatchRef.current = controller.dispatch;

  useEffect(() => {
    getLiveSelectedNodeIdsRef.current = () =>
      getNodes()
        .filter((node) => node.selected)
        .map((node) => node.id);
  }, [getNodes]);

  const handleQuickAdd = useCallback(
    (sourceNodeId: string, nodeType: BuilderNodeType) => {
      const position = quickAddPosition(sourceNodeId, (id) => {
        const node = controller.state.document.nodes.find((entry) => entry.id === id);
        return node ? node.position : undefined;
      });
      controller.insertNodeAfter(sourceNodeId, nodeType, position);
    },
    [controller],
  );

  const handleQuickAddRef = useRef(handleQuickAdd);
  handleQuickAddRef.current = handleQuickAdd;

  const onQuickAddStable = useCallback<NonNullable<WorkflowNodeData["onQuickAdd"]>>(
    (sourceNodeId, nodeType) => {
      handleQuickAddRef.current(sourceNodeId, nodeType);
    },
    [],
  );

  const { document, selectedNodeIds } = controller.state;
  const builderSelectedRef = useRef(selectedNodeIds);
  builderSelectedRef.current = selectedNodeIds;

  const documentNodesRef = useRef(document.nodes);
  documentNodesRef.current = document.nodes;
  const documentEdgesRef = useRef(document.edges);
  documentEdgesRef.current = document.edges;

  const nodeSignature = useMemo(() => documentNodeSignature(document.nodes), [document.nodes]);

  const viewportReadyRef = useRef(false);
  const userDraggingRef = useRef(false);

  const flowNodes = useMemo(
    () => documentToFlowNodes(document.nodes, selectedNodeIds, nodeText, onQuickAddStable),
    [document.nodes, selectedNodeIds, nodeText, onQuickAddStable, nodeSignature],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const nodeTypes = useMemo(() => listNodeRenderers(), []);

  useEffect(() => {
    if (userDraggingRef.current) return;
    setNodes((current) => mergeFlowNodesIntoCurrent(current, flowNodes));
  }, [flowNodes, setNodes]);

  const edges = useMemo(
    () => documentToFlowEdges(document.nodes, document.edges, (label) => localizeDefaultBranchLabel(label, branchLabel)),
    [document.nodes, document.edges, branchLabel],
  );
  const isEmpty = document.nodes.length === 0;

  const viewport = document.viewport;
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  useLayoutEffect(() => {
    viewportReadyRef.current = false;

    const hasStoredViewport = viewport.x !== 0 || viewport.y !== 0 || viewport.zoom !== 1;
    if (!isEmpty && !hasStoredViewport && !fitViewAppliedFlowIds.has(document.flowId)) {
      fitView({ padding: 0.18, duration: 0 });
      fitViewAppliedFlowIds.add(document.flowId);
      requestAnimationFrame(() => {
        dispatchRef.current({ type: "SET_VIEWPORT", viewport: getViewport() });
        viewportReadyRef.current = true;
      });
      return;
    }

    const frame = requestAnimationFrame(() => {
      viewportReadyRef.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [document.flowId, fitView, getViewport, isEmpty]);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const removedNodeIds = changes
        .filter((change) => change.type === "remove")
        .map((change) => change.id);
      if (removedNodeIds.length > 0) {
        dispatchRef.current({ type: "DELETE_NODES", nodeIds: removedNodeIds });
        return;
      }

      onNodesChange(changes);

      const positionChanges = changes.filter((change) => change.type === "position");
      if (positionChanges.length === 0) return;

      const dragging = positionChanges.some((change) => change.dragging);
      if (dragging) {
        userDraggingRef.current = true;
        return;
      }

      if (!userDraggingRef.current) return;

      userDraggingRef.current = false;

      const positions = positionChanges.flatMap((change) => {
        if (change.type !== "position" || !change.position) return [];
        return [{ id: change.id, x: change.position.x, y: change.position.y }];
      });
      if (positions.length === 0) return;

      dispatchRef.current({ type: "UPDATE_NODE_POSITIONS", positions });
    },
    [onNodesChange],
  );

  const onSelectionChange = useCallback(
    ({ nodes }: OnSelectionChangeParams) => {
      const rfSelectedIds = nodes.map((node) => node.id);
      const builderSelectedIds = builderSelectedRef.current;

      if (rfSelectedIds.length > 0) {
        rememberCanvasSelection(rfSelectedIds);
      } else if (builderSelectedIds.length === 0) {
        rememberCanvasSelection([]);
      } else {
        rememberCanvasSelection(builderSelectedIds);
      }

      if (rfSelectedIds.length === 0 && builderSelectedIds.length > 0) {
        return;
      }

      if (selectionKey(rfSelectedIds) === selectionKey(builderSelectedIds)) {
        return;
      }

      dispatchRef.current({ type: "SELECT_NODES", nodeIds: rfSelectedIds });
    },
    [],
  );

  const onViewportChange = useCallback((nextViewport: Viewport) => {
    if (!viewportReadyRef.current) return;

    const current = viewportRef.current;
    const epsilon = 0.001;
    if (
      Math.abs(current.x - nextViewport.x) < epsilon &&
      Math.abs(current.y - nextViewport.y) < epsilon &&
      Math.abs(current.zoom - nextViewport.zoom) < epsilon
    ) {
      return;
    }

    dispatchRef.current({ type: "SET_VIEWPORT", viewport: nextViewport });
  }, []);

  const onEdgesChange = useCallback((changes: Parameters<typeof applyEdgeChanges>[0]) => {
    const removed = changes.filter((change) => change.type === "remove").map((change) => change.id);
    if (removed.length > 0) dispatchRef.current({ type: "DELETE_EDGES", edgeIds: removed });
  }, []);

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      if (connection.sourceHandle != null && connection.sourceHandle !== "source") return;
      if (connection.targetHandle != null && connection.targetHandle !== "target") return;

      const nodes = documentNodesRef.current;
      const edges = documentEdgesRef.current;
      const allowed = canConnect({
        sourceId: connection.source,
        targetId: connection.target,
        nodes,
        edges,
      });
      if (!allowed.allowed) return;
      dispatchRef.current({
        type: "ADD_EDGE",
        edge: createEdgeFromNodes(connection.source, connection.target, nodes, edges),
      });
    },
    [],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/workflow-node") as BuilderNodeType;
      if (!type) return;
      const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
      controller.addNode(type, {
        x: event.clientX - bounds.left - 120,
        y: event.clientY - bounds.top - 48,
      });
    },
    [controller],
  );

  return (
    <div className="relative h-full w-full" style={{ width, height }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        viewport={viewport}
        style={{ width, height }}
        onViewportChange={onViewportChange}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        onPaneClick={() => dispatchRef.current({ type: "SELECT_NODES", nodeIds: [] })}
        onDrop={onDrop}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        nodesFocusable={false}
        autoPanOnNodeFocus={false}
        snapToGrid
        snapGrid={[20, 20]}
        selectionOnDrag
        panOnDrag={[1, 2]}
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode={["Meta", "Control"]}
        deleteKeyCode={["Delete", "Backspace"]}
        proOptions={{ hideAttribution: true }}
        className="bg-muted/20"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="hsl(var(--border))" />
        <MiniMap pannable zoomable className="!rounded-xl !border !border-border/60 !bg-card/90" />
        <Controls showInteractive={false} className="!rounded-xl !border !border-border/60 !bg-card/90 !shadow-lg" />
      </ReactFlow>
      {isEmpty ? (
        <CanvasEmptyState
          onAddStart={() => controller.addNode("start", { x: 280, y: 120 })}
        />
      ) : null}
    </div>
  );
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  const { containerRef, size, isReady } = useCanvasContainerSize();

  return (
    <div
      ref={containerRef}
      className="h-full min-h-0 w-full overflow-hidden rounded-2xl border border-border/60 bg-card/40 shadow-inner"
    >
      {isReady ? <WorkflowCanvasInner {...props} width={size.width} height={size.height} /> : null}
    </div>
  );
}
