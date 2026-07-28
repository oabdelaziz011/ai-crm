/**
 * Canvas node sync — document ↔ controlled React Flow nodes.
 *
 * ## Synchronization contract (Commit 6)
 *
 * ### Document → Runtime (single reconciliation path)
 *
 * ```
 * Document reducer (persistent truth)
 *     ↓ documentToFlowNodes
 * Flow-node projection
 *     ↓ seedControlledNodesFromDocument   ← ONLY document → controlled path
 * Controlled nodes (useNodesState)
 *     ↓ nodes prop
 * React Flow store (StoreUpdater)
 * ```
 *
 * Trigger: `documentProjectionSignature` changes (positions, ids, data, selection,
 * i18n labels). Does not run during drag because the document is unchanged until
 * drag-end commit. Never triggered by runtime `dimensions` or transient `select`
 * apply alone.
 *
 * Document mutations (ADD_NODE, DELETE_NODES, UPDATE_NODE_POSITIONS, UPDATE_NODE_CONFIG,
 * DUPLICATE, UNDO, REDO, IMPORT, REPLACE_STATE, etc.) all change the projection
 * signature and reconcile through seed — never through applyNodeChanges.
 *
 * ### Runtime → Document (exception paths only)
 *
 * | Runtime change | Path to controlled nodes | Path to document |
 * |----------------|--------------------------|------------------|
 * | select         | applyNodeChanges → setNodes | handleNodesChange / onSelectionChange → SELECT_NODES |
 * | dimensions     | applyNodeChanges → setNodes | none |
 * | position drag  | applyNodeChanges(position) → setNodes (transient mirror) | drag-end → UPDATE_NODE_POSITIONS → seed |
 *
 * ### Why exactly one reconciliation path
 *
 * Multiple document→controlled writers caused StoreUpdater feedback loops and split
 * ownership. Runtime apply handles RF controlled-mode requirements (select, measure);
 * seed merges document truth into the controlled array while preserving RF runtime
 * fields (`measured`, `width`, `height`). Two writers, non-overlapping concerns.
 *
 * Ownership (Sprint 5.6):
 * - **Document** owns persistent state: ids, types, committed positions, config/data, selection.
 * - **React Flow** owns runtime state: measured, dimensions, handleBounds, dragging.
 * - **Controlled nodes** (`useNodesState`) are a projection surface only — not a third source of truth.
 * - Position commits: document reducer via `UPDATE_NODE_POSITIONS` (drag-end only).
 * - Transient drag positions reach `applyNodeChanges` (controlled mirror only); seed
 *   reconciles committed positions after `UPDATE_NODE_POSITIONS`.
 * - Selection semantics: document reducer via `SELECT_NODES` (onSelectionChange / onPaneClick).
 * - Selection runtime: `applyNodeChanges(select)` in handleNodesChange (RF controlled contract).
 * - Dimensions runtime: `applyNodeChanges(dimensions)` in handleNodesChange (RF measure sync).
 * - `seedControlledNodesFromDocument` reconciles document fields (undo/load/programmatic/drag-end).
 *
 * Controlled-node writers (audit):
 * | Call site                              | Class              | Allowed fields        |
 * |----------------------------------------|--------------------|-----------------------|
 * | syncEffect → seedControlledNodesFromDocument | Document reconcile | position, selected, data, ids |
 * | onNodesChange → applyNodeChanges       | Controlled mirror  | select, dimensions, position |
 * | useNodesState initializer (mount)      | Document reconcile | full projection (via seed) |
 *
 * NodeChange routing (handleNodesChange):
 * | type        | Owner / path                                              |
 * |-------------|-----------------------------------------------------------|
 * | select      | applyNodeChanges → setNodes (mirror); SELECT_NODES (doc) |
 * | dimensions  | applyNodeChanges → setNodes (mirror only)                |
 * | position    | applyNodeChanges → setNodes (mirror); UPDATE_NODE_POSITIONS (doc, drag end) |
 * | remove      | document: DELETE_NODES → seed                             |
 * | add         | document actions → seed (never apply)                     |
 * | replace     | document actions → seed (never apply)                     |
 * | reset       | ignored (never apply)                                     |
 *
 * This module provides:
 * - `seedControlledNodesFromDocument` — the sole document → controlled reconciliation
 * - `documentProjectionSignature` — bounded seed trigger (document projection only)
 * - `filterRuntimeApplyNodeChanges` — runtime apply allow-list (select + dimensions)
 * - `extractDragCommitPositions` — drag-end position commit extraction
 * - Re-exports of the document bridge used by the canvas
 *
 * Architecture reference: `canvas-sync-architecture.md` (Commit 8).
 *
 * ## Remaining sync implementations (Commit 7)
 *
 * | Concern                 | Single implementation                         | Module |
 * |-------------------------|---------------------------------------------|--------|
 * | Document reconciliation | `seedControlledNodesFromDocument`           | canvas-node-sync |
 * | Runtime sync            | `filterRuntimeApplyNodeChanges` → apply     | workflow-canvas |
 * | Drag commit             | `extractDragCommitPositions` → reducer      | canvas-node-sync + workflow-canvas |
 * | Selection runtime       | applyNodeChanges(select)                    | workflow-canvas |
 * | Selection semantic      | onSelectionChange → SELECT_NODES            | workflow-canvas |
 * | Alignment selection     | `resolveAlignmentSelection`                 | canvas-selection-guard |
 */
import type { Node, NodeChange } from "@xyflow/react";
import type { WorkflowNodeData } from "../nodes/workflow-node-card";
import { documentStructuralProjectionSignature } from "../../core/canvas/document-signatures";

export {
  documentNodeSignature,
  documentToFlowNodes,
} from "../../core/canvas/flow-document-bridge";
export {
  documentPresentationSignature,
  documentStructuralProjectionSignature,
  documentTopologySignature,
  documentValidationSignature,
  documentEdgePresentationSignature,
  canvasStructuralNodeSignature,
  canvasStructuralEdgeSignature,
  resolveNodePresentationLabel,
  resolveNodePresentationSubtitle,
} from "../../core/canvas/document-signatures";
export { documentToFlowEdges } from "../../core/canvas/flow-document-bridge";

/**
 * NodeChange types that update the controlled React Flow mirror via applyNodeChanges.
 * Position is transient mirror state during drag; document commit is drag-end only.
 */
export const CONTROLLED_MIRROR_CHANGE_TYPES = ["select", "dimensions", "position"] as const;

export type ControlledMirrorChangeType = (typeof CONTROLLED_MIRROR_CHANGE_TYPES)[number];

/** select + dimensions subset (excludes transient position). */
export const RUNTIME_APPLY_NODE_CHANGE_TYPES = ["select", "dimensions"] as const;

export type RuntimeApplyNodeChangeType = (typeof RUNTIME_APPLY_NODE_CHANGE_TYPES)[number];

export function isControlledMirrorNodeChange(
  change: NodeChange,
): change is NodeChange & { type: ControlledMirrorChangeType } {
  return change.type === "select" || change.type === "dimensions" || change.type === "position";
}

export function isRuntimeApplyNodeChange(
  change: NodeChange,
): change is NodeChange & { type: RuntimeApplyNodeChangeType } {
  return change.type === "select" || change.type === "dimensions";
}

/** Controlled mirror allow-list: select, dimensions, and transient position. */
export function filterControlledMirrorNodeChanges(changes: NodeChange[]): NodeChange[] {
  return changes.filter(isControlledMirrorNodeChange);
}

/** Legacy alias — select + dimensions only (excludes position). */
export function filterRuntimeApplyNodeChanges(changes: NodeChange[]): NodeChange[] {
  return changes.filter(isRuntimeApplyNodeChange);
}

export type DragPositionChange = {
  type: "position";
  id: string;
  position: { x: number; y: number };
  dragging?: boolean;
};

/** Flow-space offset so the dropped node center aligns with the cursor. */
export const PALETTE_DROP_NODE_ANCHOR = { x: 124, y: 60 } as const;

type ScreenPoint = { x: number; y: number };
type PaneBounds = { left: number; top: number };
type FlowViewport = { x: number; y: number; zoom: number };

/**
 * Inverse of React Flow's pane transform — used by palette drop and regression tests.
 * Matches `screenToFlowPosition` when `paneBounds` is the React Flow container rect.
 */
export function clientPointToFlowPosition(
  client: ScreenPoint,
  paneBounds: PaneBounds,
  viewport: FlowViewport,
): ScreenPoint {
  return {
    x: (client.x - paneBounds.left - viewport.x) / viewport.zoom,
    y: (client.y - paneBounds.top - viewport.y) / viewport.zoom,
  };
}

/** Document position for a palette drop at a screen point under the current viewport. */
export function paletteDropFlowPosition(
  client: ScreenPoint,
  paneBounds: PaneBounds,
  viewport: FlowViewport,
): ScreenPoint {
  const flowPoint = clientPointToFlowPosition(client, paneBounds, viewport);
  return {
    x: flowPoint.x - PALETTE_DROP_NODE_ANCHOR.x,
    y: flowPoint.y - PALETTE_DROP_NODE_ANCHOR.y,
  };
}

export function extractDragCommitPositions(changes: DragPositionChange[]): Array<{ id: string; x: number; y: number }> {
  if (changes.some((change) => change.type === "position" && change.dragging)) {
    return [];
  }
  return changes.flatMap((change) => {
    if (change.type !== "position" || change.dragging) return [];
    return [{ id: change.id, x: change.position.x, y: change.position.y }];
  });
}

type FlowNodeData = WorkflowNodeData;

type FlowNode = Node<FlowNodeData>;

type ProjectionNode = Pick<FlowNode, "id" | "position" | "selected" | "data">;

/**
 * Bounded structural seed trigger — excludes presentation fields (subtitle, labels, descriptions).
 * Excludes RF runtime fields (measured, width, height) so dimension apply does not re-seed.
 */
export function documentProjectionSignature(flowNodes: ProjectionNode[]): string {
  return documentStructuralProjectionSignature(
    flowNodes.map((node) => ({
      id: node.id,
      position: node.position,
      selected: node.selected ?? false,
      nodeType: node.data.nodeType,
    })),
  );
}

function flowNodeDataEqual(existing: FlowNodeData, next: FlowNodeData): boolean {
  return existing.nodeType === next.nodeType && existing.executionStatus === next.executionStatus;
}

/**
 * Project document-derived flow nodes into the controlled React Flow array.
 * Preserves existing node object references (including RF runtime fields such as
 * `measured`, `width`, and `height`) when persistent document fields are unchanged.
 * Returns `current` when nothing semantically changed.
 */
export function seedControlledNodesFromDocument(current: FlowNode[], flowNodes: FlowNode[]): FlowNode[] {
  if (current.length !== flowNodes.length) {
    return buildSeededNodes(current, flowNodes);
  }

  const currentById = new Map(current.map((node) => [node.id, node]));
  let changed = false;
  const next: FlowNode[] = [];

  for (const flowNode of flowNodes) {
    const existing = currentById.get(flowNode.id);
    if (!existing) {
      return buildSeededNodes(current, flowNodes);
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

function buildSeededNodes(current: FlowNode[], flowNodes: FlowNode[]): FlowNode[] {
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
