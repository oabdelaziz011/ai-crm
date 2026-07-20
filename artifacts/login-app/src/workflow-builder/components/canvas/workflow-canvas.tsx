import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  applyEdgeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type OnConnect,
  type OnSelectionChangeParams,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { canConnect } from "../../core/connection-rules";
import { resolveBranchEdgeStyle } from "../../core/logic/branch-utils";
import { listNodeRenderers, registerDefaultNodeRenderers } from "../../core/registry/node-renderer-registry";
import { createEdgeFromNodes } from "../../core/state/builder-reducer";
import { getWorkflowNodeDefinition } from "../../core/node-registry";
import type { WorkflowBuilderController } from "../../hooks/use-workflow-builder";
import type { BuilderNodeType } from "../../core/types";
import { CanvasEmptyState } from "./canvas-empty-state";
import { quickAddPosition, type WorkflowNodeData } from "../nodes/workflow-node-card";
import { useWorkflowBuilderI18n } from "@/workflow-builder/hooks/use-workflow-builder-i18n";

registerDefaultNodeRenderers();

/** Survives ReactFlowProvider remounts within the same browser tab session. */
const viewportInitializedFlowIds = new Set<string>();

type WorkflowCanvasProps = {
  controller: WorkflowBuilderController;
};

function toFlowNodes(
  controller: WorkflowBuilderController,
  onQuickAdd: WorkflowNodeData["onQuickAdd"],
  nodeText: (nodeId: string, field: "displayName" | "description", fallback: string) => string,
  selectedNodeIds: string[],
): Node<WorkflowNodeData>[] {
  const selectedIds = new Set(selectedNodeIds);
  return controller.state.document.nodes.map((node) => {
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

function toFlowEdges(
  controller: WorkflowBuilderController,
  localizeBranchLabel: (label: string) => string,
): Edge[] {
  const nodesById = new Map(controller.state.document.nodes.map((node) => [node.id, node]));
  return controller.state.document.edges.map((edge) => {
    const sourceNode = nodesById.get(edge.source);
    const branchStyle = resolveBranchEdgeStyle(sourceNode, edge);
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      animated: true,
      label: localizeBranchLabel(branchStyle.label ?? ""),
      labelStyle: { fill: branchStyle.stroke, fontWeight: 600 },
      style: { strokeWidth: 2.5, stroke: branchStyle.stroke },
    };
  });
}

function localizeDefaultBranchLabel(label: string, branchLabel: (key: string, fallback?: string) => string): string {
  if (label === "Default") return branchLabel("default", label);
  if (label === "Case") return branchLabel("case", label);
  if (label === "Yes") return branchLabel("yes", label);
  if (label === "No") return branchLabel("no", label);
  return label;
}

function WorkflowCanvasInner({ controller }: WorkflowCanvasProps) {
  const { fitView, setViewport, getNode } = useReactFlow();
  const { nodeText, branchLabel } = useWorkflowBuilderI18n();

  const handleQuickAdd = useCallback(
    (sourceNodeId: string, nodeType: BuilderNodeType) => {
      const position = quickAddPosition(sourceNodeId, (id) => {
        const node = getNode(id);
        return node ? node.position : undefined;
      });
      controller.insertNodeAfter(sourceNodeId, nodeType, position);
    },
    [controller, getNode],
  );

  const handleQuickAddRef = useRef(handleQuickAdd);
  handleQuickAddRef.current = handleQuickAdd;

  const onQuickAddStable = useCallback<NonNullable<WorkflowNodeData["onQuickAdd"]>>(
    (sourceNodeId, nodeType) => {
      handleQuickAddRef.current(sourceNodeId, nodeType);
    },
    [],
  );

  const nodes = useMemo(
    () => toFlowNodes(controller, onQuickAddStable, nodeText, controller.state.selectedNodeIds),
    [controller.state.document.nodes, controller.state.selectedNodeIds, nodeText, onQuickAddStable],
  );
  const edges = useMemo(
    () => toFlowEdges(controller, (label) => localizeDefaultBranchLabel(label, branchLabel)),
    [controller.state.document.edges, branchLabel],
  );
  const isEmpty = controller.state.document.nodes.length === 0;

  useEffect(() => {
    const flowId = controller.state.document.flowId;
    if (!flowId || viewportInitializedFlowIds.has(flowId)) return;
    viewportInitializedFlowIds.add(flowId);

    const viewport = controller.state.document.viewport;
    const hasStoredViewport = viewport.x !== 0 || viewport.y !== 0 || viewport.zoom !== 1;
    setViewport(viewport, { duration: 0 });
    if (!isEmpty && !hasStoredViewport) {
      fitView({ padding: 0.18, duration: 0 });
    }
  }, [controller.state.document.flowId, controller.state.document.viewport, fitView, isEmpty, setViewport]);

  const onNodesChange = useCallback(
    (changes: Parameters<typeof import("@xyflow/react").applyNodeChanges>[0]) => {
      const positions = changes.flatMap((change) => {
        if (change.type !== "position" || !change.position || change.dragging) return [];
        return [{ id: change.id, x: change.position.x, y: change.position.y }];
      });
      if (positions.length > 0) controller.dispatch({ type: "UPDATE_NODE_POSITIONS", positions });
      // Node deletes are handled by builder keyboard actions. React Flow emits spurious
      // `remove` changes when controlled node data updates, which must not delete graph nodes.
    },
    [controller],
  );

  const onSelectionChange = useCallback(
    ({ nodes }: OnSelectionChangeParams) => {
      const nodeIds = nodes.map((node) => node.id);
      if (nodeIds.length === 0) return;
      if (
        nodeIds.length === controller.state.selectedNodeIds.length &&
        nodeIds.every((id, index) => id === controller.state.selectedNodeIds[index])
      ) {
        return;
      }
      controller.dispatch({ type: "SELECT_NODES", nodeIds });
    },
    [controller],
  );

  const onEdgesChange = useCallback(
    (changes: Parameters<typeof applyEdgeChanges>[0]) => {
      const removed = changes.filter((change) => change.type === "remove").map((change) => change.id);
      if (removed.length > 0) controller.dispatch({ type: "DELETE_EDGES", edgeIds: removed });
    },
    [controller],
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const allowed = canConnect({
        sourceId: connection.source,
        targetId: connection.target,
        nodes: controller.state.document.nodes,
        edges: controller.state.document.edges,
      });
      if (!allowed.allowed) return;
      controller.dispatch({
        type: "ADD_EDGE",
        edge: createEdgeFromNodes(connection.source, connection.target, controller.state.document.nodes, controller.state.document.edges),
      });
    },
    [controller],
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

  const onMoveEnd = useCallback(
    (_event: unknown, viewport: Viewport) => {
      controller.dispatch({ type: "SET_VIEWPORT", viewport });
    },
    [controller],
  );

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={listNodeRenderers()}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        onPaneClick={() => controller.dispatch({ type: "SELECT_NODES", nodeIds: [] })}
        onDrop={onDrop}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onMoveEnd={onMoveEnd}
        snapToGrid
        snapGrid={[20, 20]}
        selectionOnDrag
        panOnDrag={[1, 2]}
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode={["Meta", "Control"]}
        deleteKeyCode={null}
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
  return (
    <div className="h-full w-full overflow-hidden rounded-2xl border border-border/60 bg-card/40 shadow-inner">
      <ReactFlowProvider>
        <WorkflowCanvasInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}
