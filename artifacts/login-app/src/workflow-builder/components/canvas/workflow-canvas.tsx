import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, type SetStateAction } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  SelectionMode,
  applyEdgeChanges,
  applyNodeChanges,
  useEdgesState,
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
import { canvasStructuralEdgeSignature, canvasStructuralNodeSignature } from "../../core/canvas/document-signatures";
import { documentToFlowEdges, documentToFlowNodes } from "../../core/canvas/flow-document-bridge";
import type { BuilderNode, ValidationIssue } from "../../core/types";
import { listNodeRenderers, registerDefaultNodeRenderers } from "../../core/registry/node-renderer-registry";
import { createEdgeFromNodes } from "../../core/state/builder-reducer";
import type { BuilderNodeType } from "../../core/types";
import { CanvasEmptyState } from "./canvas-empty-state";
import {
  applyEdgeValidationPatch,
  seedControlledEdgesFromDocument,
  type WorkflowFlowEdge,
} from "./canvas-edge-sync";
import {
  CanvasEdgePresentationSync,
  CanvasEdgeValidationSync,
  CanvasPresentationSync,
  CanvasValidationSync,
  patchNodePresentationData,
  patchNodeValidationData,
  patchEdgePresentationData,
  type CanvasEdgePresentationPatcher,
  type CanvasEdgeValidationPatcher,
  type CanvasNodePresentationPatcher,
  type CanvasNodeValidationPatcher,
} from "./canvas-sync-layers";
import {
  extractDragCommitPositions,
  filterControlledMirrorNodeChanges,
  filterRuntimeApplyNodeChanges,
  PALETTE_DROP_NODE_ANCHOR,
  seedControlledNodesFromDocument,
  type DragPositionChange,
} from "./canvas-node-sync";
import { useCanvasSyncTrace } from "../../debug/canvas-sync-trace-context";
import { quickAddPosition, type WorkflowNodeData } from "../nodes/workflow-node-card";
import { useCanvasContainerSize } from "../../hooks/use-canvas-container-size";
import { useBuilderActions, useCanvasBuilderSlice } from "../../context/workflow-builder-context";
import { builderRenderPerf } from "../../debug/builder-render-perf";

registerDefaultNodeRenderers();

const fitViewAppliedFlowIds = new Set<string>();

type WorkflowCanvasInnerProps = {
  width: number;
  height: number;
};

export const WorkflowCanvasInner = memo(function WorkflowCanvasInner({ width, height }: WorkflowCanvasInnerProps) {
  const canvasSlice = useCanvasBuilderSlice();
  const { dispatch, addNode, insertNodeAfter, registerCanvasFocusHandler } = useBuilderActions();
  const { fitView, getNodes, getViewport, screenToFlowPosition, setCenter } = useReactFlow();
  const syncTrace = useCanvasSyncTrace();
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  useEffect(() => {
    getLiveSelectedNodeIdsRef.current = () =>
      getNodes()
        .filter((node) => node.selected)
        .map((node) => node.id);
  }, [getNodes]);

  const handleQuickAddRef = useRef<(sourceNodeId: string, nodeType: BuilderNodeType) => void>(() => {});
  handleQuickAddRef.current = (sourceNodeId, nodeType) => {
    const position = quickAddPosition(sourceNodeId, (id) => {
      const node = canvasSlice.nodes.find((entry) => entry.id === id);
      return node ? node.position : undefined;
    });
    insertNodeAfter(sourceNodeId, nodeType, position);
  };

  const onQuickAddStable = useCallback<NonNullable<WorkflowNodeData["onQuickAdd"]>>(
    (sourceNodeId, nodeType) => {
      handleQuickAddRef.current(sourceNodeId, nodeType);
    },
    [],
  );

  const builderSelectedRef = useRef(canvasSlice.selectedNodeIds);
  builderSelectedRef.current = canvasSlice.selectedNodeIds;

  const focusValidationIssue = useCallback(
    (issue: ValidationIssue) => {
      const nodeIds =
        issue.affectedNodeIds ?? (issue.focusNodeId ? [issue.focusNodeId] : issue.nodeId ? [issue.nodeId] : []);
      if (nodeIds.length === 0) return;

      dispatchRef.current({ type: "SELECT_NODES", nodeIds });
      const rfNodes = getNodes().filter((node) => nodeIds.includes(node.id));
      if (rfNodes.length > 0) {
        fitView({
          nodes: rfNodes.map((node) => ({ id: node.id })),
          padding: 0.35,
          duration: 280,
          maxZoom: 1.15,
        });
        return;
      }

      const focusNodeId = issue.focusNodeId ?? nodeIds[0];
      const documentNode = canvasSlice.nodes.find((node) => node.id === focusNodeId);
      if (documentNode) {
        setCenter(documentNode.position.x + 124, documentNode.position.y + 56, { zoom: 1.05, duration: 280 });
      }
    },
    [canvasSlice.nodes, fitView, getNodes, setCenter],
  );

  useEffect(() => {
    registerCanvasFocusHandler(focusValidationIssue);
  }, [registerCanvasFocusHandler, focusValidationIssue]);

  const structuralNodes = canvasSlice.nodes;

  const structuralNodeSignature = useMemo(
    () => canvasStructuralNodeSignature(structuralNodes, canvasSlice.selectedNodeIds),
    [structuralNodes, canvasSlice.selectedNodeIds],
  );

  const flowNodes = useMemo(() => {
    builderRenderPerf.structuralProjectionRuns += 1;
    builderRenderPerf.projectionRuns += 1;
    return documentToFlowNodes(structuralNodes, canvasSlice.selectedNodeIds, onQuickAddStable);
  }, [structuralNodes, canvasSlice.selectedNodeIds, onQuickAddStable]);

  const structuralEdgeSignature = useMemo(
    () => canvasStructuralEdgeSignature(structuralNodes, canvasSlice.edges),
    [structuralNodes, canvasSlice.edges],
  );

  const structuralFlowEdges = useMemo(() => {
    builderRenderPerf.structuralProjectionRuns += 1;
    builderRenderPerf.projectionRuns += 1;
    return documentToFlowEdges(structuralNodes, canvasSlice.edges);
  }, [structuralNodes, canvasSlice.edges]);

  const [nodes, setNodesInternal] = useNodesState<Node<WorkflowNodeData>>(
    seedControlledNodesFromDocument([], flowNodes),
  );
  const [edges, setEdgesInternal] = useEdgesState<WorkflowFlowEdge>(structuralFlowEdges);
  const nodeTypes = useMemo(() => listNodeRenderers(), []);

  const setNodesMetaRef = useRef<{ caller: string; reason: string } | null>(null);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
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

  const setEdges = useCallback(
    (updater: SetStateAction<WorkflowFlowEdge[]>) => {
      setEdgesInternal((current) => (typeof updater === "function" ? updater(current) : updater));
    },
    [setEdgesInternal],
  );

  const callSetNodes = useCallback(
    (caller: string, reason: string, updater: SetStateAction<Node<WorkflowNodeData>[]>) => {
      setNodesMetaRef.current = { caller, reason };
      setNodes(updater);
    },
    [setNodes],
  );

  const presentationPatchRef = useRef<CanvasNodePresentationPatcher | null>(null);
  presentationPatchRef.current = {
    patchPresentation: (presentationNodes, presentationNodeText) => {
      builderRenderPerf.presentationPatches += 1;
      builderRenderPerf.presentationPatchRuns += 1;
      callSetNodes("presentationSync", "label+subtitle patch", (current) =>
        patchNodePresentationData(current, presentationNodes, presentationNodeText),
      );
    },
  };

  const validationPatchRef = useRef<CanvasNodeValidationPatcher | null>(null);
  validationPatchRef.current = {
    patchValidation: (highlight) => {
      builderRenderPerf.validationPatches += 1;
      callSetNodes("validationSync", "node validation patch", (current) =>
        patchNodeValidationData(current, highlight),
      );
    },
  };

  const edgePresentationPatchRef = useRef<CanvasEdgePresentationPatcher | null>(null);
  edgePresentationPatchRef.current = {
    patchEdgePresentation: (localizedLabelById) => {
      builderRenderPerf.edgePresentationPatches += 1;
      setEdges((current) => patchEdgePresentationData(current, localizedLabelById));
    },
  };

  const edgeValidationPatchRef = useRef<CanvasEdgeValidationPatcher | null>(null);
  edgeValidationPatchRef.current = {
    patchEdgeValidation: (highlight) => {
      builderRenderPerf.edgeValidationPatches += 1;
      setEdges((current) => applyEdgeValidationPatch(current, highlight));
    },
  };

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      syncTrace?.onNodesChange(
        "workflow-canvas.tsx:onNodesChange",
        "applyNodeChanges",
        changes,
        nodesRef.current.length,
      );
      callSetNodes("onNodesChange→applyNodeChanges", `batchSize=${changes.length}`, (current) =>
        applyNodeChanges(changes, current) as Node<WorkflowNodeData>[],
      );
    },
    [callSetNodes, syncTrace],
  );

  const flowNodesRef = useRef(flowNodes);
  flowNodesRef.current = flowNodes;
  const structuralFlowEdgesRef = useRef(structuralFlowEdges);
  structuralFlowEdgesRef.current = structuralFlowEdges;

  useLayoutEffect(() => {
    if (!syncTrace) return;
    syncTrace.nodesPropRender(renderCountRef.current, prevNodesPropRef.current, nodes);
    if (prevNodesPropRef.current !== nodes) {
      syncTrace.storeUpdaterProp(prevNodesPropRef.current, nodes, { render: renderCountRef.current });
    }
    prevNodesPropRef.current = nodes;
  });

  useLayoutEffect(() => {
    syncTrace?.syncEffect("structuralNodeSignature changed", nodesRef.current.length, false, {
      structuralNodeSignature,
    });
    callSetNodes("syncEffect→seedControlledNodesFromDocument", "structuralNodeSignature changed", (current) => {
      builderRenderPerf.canvasSeeds += 1;
      builderRenderPerf.canvasSeedCommits += 1;
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
  }, [structuralNodeSignature, callSetNodes, syncTrace]);

  useLayoutEffect(() => {
    setEdges((current) => {
      builderRenderPerf.edgeSeeds += 1;
      return seedControlledEdgesFromDocument(current, structuralFlowEdgesRef.current);
    });
  }, [structuralEdgeSignature, setEdges]);

  const isEmpty = canvasSlice.nodes.length === 0;

  const viewport = canvasSlice.viewport;
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const viewportReadyRef = useRef(false);

  useLayoutEffect(() => {
    viewportReadyRef.current = false;

    const hasStoredViewport = viewport.x !== 0 || viewport.y !== 0 || viewport.zoom !== 1;
    if (!isEmpty && !hasStoredViewport && !fitViewAppliedFlowIds.has(canvasSlice.flowId)) {
      fitView({ padding: 0.18, duration: 0 });
      fitViewAppliedFlowIds.add(canvasSlice.flowId);
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
  }, [canvasSlice.flowId, fitView, getViewport, isEmpty, viewport]);

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

  const onSelectionChange = useCallback(({ nodes: selectedNodes }: OnSelectionChangeParams) => {
    const rfSelectedIds = selectedNodes.map((node) => node.id);
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
  }, []);

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

      const nodes = canvasSlice.nodes as BuilderNode[];
      const edgeList = canvasSlice.edges;
      const allowed = canConnect({
        sourceId: connection.source,
        targetId: connection.target,
        nodes,
        edges: edgeList,
      });
      if (!allowed.allowed) return;
      dispatchRef.current({
        type: "ADD_EDGE",
        edge: createEdgeFromNodes(connection.source, connection.target, nodes, edgeList),
      });
    },
    [canvasSlice.edges, canvasSlice.nodes],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/workflow-node") as BuilderNodeType;
      if (!type) return;
      const flowPoint = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addNode(type, {
        x: flowPoint.x - PALETTE_DROP_NODE_ANCHOR.x,
        y: flowPoint.y - PALETTE_DROP_NODE_ANCHOR.y,
      });
    },
    [addNode, screenToFlowPosition],
  );

  return (
    <div className="relative h-full w-full" style={{ width, height }}>
      <CanvasPresentationSync patchRef={presentationPatchRef} />
      <CanvasValidationSync patchRef={validationPatchRef} />
      <CanvasEdgePresentationSync
        patchRef={edgePresentationPatchRef}
        structuralNodes={structuralNodes}
        edges={canvasSlice.edges}
      />
      <CanvasEdgeValidationSync patchRef={edgeValidationPatchRef} />
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
      {isEmpty ? <CanvasEmptyState onAddStart={() => addNode("start", { x: 280, y: 120 })} /> : null}
    </div>
  );
});

export const WorkflowCanvas = memo(function WorkflowCanvas() {
  const { containerRef, size, isReady } = useCanvasContainerSize();

  return (
    <div
      ref={containerRef}
      className="h-full min-h-0 w-full overflow-hidden rounded-2xl border border-border/60 bg-card/40 shadow-inner"
    >
      {isReady ? <WorkflowCanvasInner width={size.width} height={size.height} /> : null}
    </div>
  );
});
