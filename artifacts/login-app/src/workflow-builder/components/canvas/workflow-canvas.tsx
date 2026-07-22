import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type SetStateAction } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  SelectionMode,
  applyEdgeChanges,
  applyNodeChanges,
  useNodesState,
  useReactFlow,
  type Connection,
  type Node,
  type NodeChange,
  type OnConnect,
  type OnSelectionChangeParams,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { canConnect } from "../../core/connection-rules";
import {
  getLiveSelectedNodeIdsRef,
  rememberCanvasSelection,
  selectionKey,
} from "../../core/canvas/canvas-selection-guard";
import { documentToFlowEdges, documentToFlowNodes } from "../../core/canvas/flow-document-bridge";
import { listNodeRenderers, registerDefaultNodeRenderers } from "../../core/registry/node-renderer-registry";
import { createEdgeFromNodes } from "../../core/state/builder-reducer";
import type { WorkflowBuilderController } from "../../hooks/use-workflow-builder";
import type { BuilderNodeType } from "../../core/types";
import { CanvasEmptyState } from "./canvas-empty-state";
import {
  documentProjectionSignature,
  extractDragCommitPositions,
  filterControlledMirrorNodeChanges,
  filterRuntimeApplyNodeChanges,
  PALETTE_DROP_NODE_ANCHOR,
  seedControlledNodesFromDocument,
  type DragPositionChange,
} from "./canvas-node-sync";
import { useCanvasSyncTrace } from "../../debug/canvas-sync-trace-context";
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
  const { fitView, getNodes, getViewport, screenToFlowPosition } = useReactFlow();
  const syncTrace = useCanvasSyncTrace();
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

  const viewportReadyRef = useRef(false);

  const flowNodes = useMemo(
    () => documentToFlowNodes(document.nodes, selectedNodeIds, nodeText, onQuickAddStable),
    [document.nodes, selectedNodeIds, nodeText, onQuickAddStable],
  );

  const projectionSignature = useMemo(() => documentProjectionSignature(flowNodes), [flowNodes]);

  // Mount bootstrap uses seed — not a direct documentToFlowNodes → setNodes bypass.
  const [nodes, setNodesInternal] = useNodesState<Node<WorkflowNodeData>[]>(() =>
    seedControlledNodesFromDocument([], flowNodes),
  );
  const nodeTypes = useMemo(() => listNodeRenderers(), []);

  const setNodesMetaRef = useRef<{ caller: string; reason: string } | null>(null);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const prevNodesPropRef = useRef(nodes);
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  const setNodes = useCallback(
    (updater: SetStateAction<Node<WorkflowNodeData>[]>) => {
      setNodesInternal((current) => {
        const meta = setNodesMetaRef.current ?? { caller: "setNodes.unlabeled", reason: "no caller metadata" };
        setNodesMetaRef.current = null;
        const after =
          typeof updater === "function"
            ? (updater as (current: Node<WorkflowNodeData>[]) => Node<WorkflowNodeData>[])(current)
            : updater;
        syncTrace?.setNodes(meta.caller, meta.reason, current, after);
        return after;
      });
    },
    [setNodesInternal, syncTrace],
  );

  const callSetNodes = useCallback(
    (caller: string, reason: string, updater: SetStateAction<Node<WorkflowNodeData>[]>) => {
      setNodesMetaRef.current = { caller, reason };
      setNodes(updater);
    },
    [setNodes],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      syncTrace?.onNodesChange(
        "workflow-canvas.tsx:onNodesChange",
        "applyNodeChanges",
        changes,
        nodesRef.current.length,
      );
      callSetNodes("onNodesChange→applyNodeChanges", `batchSize=${changes.length}`, (current) =>
        applyNodeChanges(changes, current),
      );
    },
    [callSetNodes, syncTrace],
  );

  const flowNodesRef = useRef(flowNodes);
  flowNodesRef.current = flowNodes;

  useLayoutEffect(() => {
    if (!syncTrace) return;
    syncTrace.nodesPropRender(renderCountRef.current, prevNodesPropRef.current, nodes);
    if (prevNodesPropRef.current !== nodes) {
      syncTrace.storeUpdaterProp(prevNodesPropRef.current, nodes, { render: renderCountRef.current });
    }
    prevNodesPropRef.current = nodes;
  });

  // Commit 6 — sole document → controlled reconciliation path (bounded by projectionSignature).
  useEffect(() => {
    syncTrace?.syncEffect("documentProjectionSignature changed", nodesRef.current.length, false, {
      projectionSignature,
    });
    callSetNodes("syncEffect→seedControlledNodesFromDocument", "documentProjectionSignature changed", (current) => {
      const seeded = seedControlledNodesFromDocument(current, flowNodesRef.current);
      return syncTrace
        ? syncTrace.seedControlledNodesFromDocument(
            "syncEffect",
            "seedControlledNodesFromDocument",
            current,
            flowNodesRef.current,
            seeded,
          )
        : seeded;
    });
  }, [projectionSignature, callSetNodes, syncTrace]);

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
      syncTrace?.handleNodesChange("ReactFlow→handleNodesChange entry", changes, nodesRef.current.length);

      const removedNodeIds = changes
        .filter((change) => change.type === "remove")
        .map((change) => change.id);
      if (removedNodeIds.length > 0) {
        dispatchRef.current({ type: "DELETE_NODES", nodeIds: removedNodeIds });
        return;
      }

      const positionChanges = changes.filter((change) => change.type === "position");
      const mirrorChanges = filterControlledMirrorNodeChanges(changes);
      if (mirrorChanges.length > 0) {
        syncTrace?.handleNodesChange("mirrorChanges→onNodesChange", mirrorChanges, nodesRef.current.length, {
          allowList: "select|dimensions|position",
        });
        onNodesChange(mirrorChanges);

        const selectChanges = filterRuntimeApplyNodeChanges(mirrorChanges);
        if (selectChanges.length > 0) {
          const runtimeSelectedIds = applyNodeChanges(selectChanges, nodesRef.current)
            .filter((node) => node.selected)
            .map((node) => node.id);
          const builderSelectedIds = builderSelectedRef.current;
          if (selectionKey(runtimeSelectedIds) !== selectionKey(builderSelectedIds)) {
            dispatchRef.current({ type: "SELECT_NODES", nodeIds: runtimeSelectedIds });
          }
        }
      }

      const commitPositions = extractDragCommitPositions(positionChanges as DragPositionChange[]);
      if (commitPositions.length > 0) {
        dispatchRef.current({ type: "UPDATE_NODE_POSITIONS", positions: commitPositions });
      }
    },
    [onNodesChange, syncTrace],
  );

  useEffect(() => {
    syncTrace?.registerCanvasHandles({
      handleNodesChange,
      getStoreNodes: () => getNodes() as Node<WorkflowNodeData>[],
    });
  }, [getNodes, handleNodesChange, syncTrace]);

  const onSelectionChange = useCallback(
    ({ nodes }: OnSelectionChangeParams) => {
      // Semantic commit only — runtime `nodes[].selected` is synced via applyNodeChanges(select).
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
      const flowPoint = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      controller.addNode(type, {
        x: flowPoint.x - PALETTE_DROP_NODE_ANCHOR.x,
        y: flowPoint.y - PALETTE_DROP_NODE_ANCHOR.y,
      });
    },
    [controller, screenToFlowPosition],
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
