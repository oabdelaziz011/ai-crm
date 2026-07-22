/**
 * Workflow Builder stability regression tests (Sprint S1).
 * Run: pnpm --dir artifacts/login-app test:workflow-builder-stability
 */
import assert from "node:assert/strict";
import { alignmentPositionUpdates } from "../src/workflow-builder/core/layout/alignment";
import { createBuilderNode } from "../src/workflow-builder/core/persistence/workflow-mapper";
import { registerBuiltInWorkflowNodes } from "../src/workflow-builder/core/register-built-in-nodes";
import { getWorkflowNodeDefinition, listWorkflowNodeDefinitions } from "../src/workflow-builder/core/node-registry";
import { createEdgeFromNodes, createInitialBuilderState, builderReducer } from "../src/workflow-builder/core/state/builder-reducer";
import { createHistoryState, historyReducer, redoHistory, undoHistory } from "../src/workflow-builder/core/state/history";
import { applyPersistedSaveResult, mergePersistedState } from "../src/workflow-builder/core/state/persist-merge";
import { resolveBuilderNodeEditorKey } from "../src/workflow-builder/core/persistence/builder-node-identity";
import type { BuilderState, WorkflowDocument } from "../src/workflow-builder/core/types";
import { registerBuiltInVariableProviders } from "../src/workflow-builder/core/variables/built-in-variable-providers";
import { applyNodeChanges, type Node } from "@xyflow/react";
import type { WorkflowNodeData } from "../src/workflow-builder/components/nodes/workflow-node-card";
import {
  documentNodeSignature,
  documentProjectionSignature,
  extractDragCommitPositions,
  filterControlledMirrorNodeChanges,
  filterRuntimeApplyNodeChanges,
  isControlledMirrorNodeChange,
  isRuntimeApplyNodeChange,
  RUNTIME_APPLY_NODE_CHANGE_TYPES,
  CONTROLLED_MIRROR_CHANGE_TYPES,
  clientPointToFlowPosition,
  paletteDropFlowPosition,
  PALETTE_DROP_NODE_ANCHOR,
  seedControlledNodesFromDocument,
} from "../src/workflow-builder/components/canvas/canvas-node-sync";
import { documentToFlowNodes } from "../src/workflow-builder/core/canvas/flow-document-bridge";
import { canConnect } from "../src/workflow-builder/core/connection-rules";
import { selectionKey, resolveAlignmentSelection } from "../src/workflow-builder/core/canvas/canvas-selection-guard";
import { isAuthUserVisibleEqual, shouldSkipTokenRefreshReload, createAuthIdentitySnapshot } from "../src/context/auth-identity";

registerBuiltInWorkflowNodes();
registerBuiltInVariableProviders();

console.log("\nWorkflow Builder stability tests\n");

const baseDocument: WorkflowDocument = {
  flowId: "flow-stability",
  companyId: "company-1",
  name: "Stability flow",
  description: "",
  triggerType: "inbound_message",
  status: "draft",
  viewport: { x: 12, y: 24, zoom: 1.4 },
  nodes: [
    createBuilderNode("start", { x: 40, y: 0 }, "n1"),
    createBuilderNode("send_message", { x: 320, y: 40 }, "n2"),
    createBuilderNode("end", { x: 640, y: 80 }, "n3"),
  ],
  edges: [
    createEdgeFromNodes("n1", "n2"),
    createEdgeFromNodes("n2", "n3"),
  ],
};

import { applyPersistedSaveResult, mergePersistedState } from "../src/workflow-builder/core/state/persist-merge";
// BUG 2 — alignment pipeline reaches reducer with position updates
const spreadNodes = baseDocument.nodes;
const leftUpdates = alignmentPositionUpdates(spreadNodes, ["n1", "n2", "n3"], "left");
assert.ok(leftUpdates.length >= 2, "align left should produce position updates");
const alignedState = builderReducer(
  { ...createInitialBuilderState(baseDocument), selectedNodeIds: ["n1", "n2", "n3"] },
  { type: "UPDATE_NODE_POSITIONS", positions: leftUpdates },
);
assert.equal(alignedState.selectedNodeIds.join(","), "n1,n2,n3");
assert.equal(alignedState.document.nodes.find((node) => node.id === "n2")?.position.x, 40);
console.log("  ✓ alignment command updates positions and preserves selection");

const documentIds = new Set(spreadNodes.map((node) => node.id));
assert.deepEqual(
  resolveAlignmentSelection(documentIds, 2, {
    override: undefined,
    builderSelected: ["n1", "n2", "n3"],
    lastKnown: [],
    domSelected: [],
    liveSelected: [],
  }),
  ["n1", "n2", "n3"],
);
assert.deepEqual(
  resolveAlignmentSelection(documentIds, 2, {
    builderSelected: [],
    lastKnown: ["n1", "n2"],
    domSelected: [],
    liveSelected: [],
  }),
  ["n1", "n2"],
);
assert.deepEqual(
  resolveAlignmentSelection(documentIds, 2, {
    builderSelected: ["n1"],
    lastKnown: ["n1", "n2", "n3"],
    domSelected: [],
    liveSelected: [],
  }),
  ["n1", "n2", "n3"],
);
assert.deepEqual(
  resolveAlignmentSelection(documentIds, 2, {
    builderSelected: ["n1"],
    lastKnown: [],
    domSelected: [],
    liveSelected: [],
  }),
  [],
);
console.log("  ✓ alignment selection survives toolbar focus loss");

for (const mode of [
  "left",
  "right",
  "top",
  "bottom",
  "center-horizontal",
  "center-vertical",
] as const) {
  const ids = resolveAlignmentSelection(documentIds, 2, {
    builderSelected: ["n1", "n2", "n3"],
    lastKnown: [],
    domSelected: [],
    liveSelected: [],
  });
  const updates = alignmentPositionUpdates(spreadNodes, ids, mode);
  assert.ok(updates.length > 0, `${mode} should produce position updates`);
  const next = builderReducer(
    { ...createInitialBuilderState(baseDocument), selectedNodeIds: ids },
    { type: "UPDATE_NODE_POSITIONS", positions: updates },
  );
  assert.equal(next.selectedNodeIds.join(","), ids.join(","), `${mode} preserves selection`);
}

const distributeNodes = [
  createBuilderNode("start", { x: 0, y: 0 }, "d1"),
  createBuilderNode("send_message", { x: 0, y: 80 }, "d2"),
  createBuilderNode("end", { x: 0, y: 400 }, "d3"),
];
const distributeHorizontalNodes = [
  createBuilderNode("start", { x: 0, y: 0 }, "h1"),
  createBuilderNode("send_message", { x: 120, y: 0 }, "h2"),
  createBuilderNode("end", { x: 520, y: 0 }, "h3"),
];

const verticalUpdates = alignmentPositionUpdates(distributeNodes, ["d1", "d2", "d3"], "distribute-vertical");
assert.ok(verticalUpdates.length > 0, "distribute-vertical should produce position updates");

const horizontalUpdates = alignmentPositionUpdates(
  distributeHorizontalNodes,
  ["h1", "h2", "h3"],
  "distribute-horizontal",
);
assert.ok(horizontalUpdates.length > 0, "distribute-horizontal should produce position updates");
console.log("  ✓ all eight alignment modes update positions through reducer");

const distributeUpdates = alignmentPositionUpdates(spreadNodes, ["n1", "n2", "n3"], "distribute-horizontal");
assert.equal(distributeUpdates.length, 1);
console.log("  ✓ distribute-horizontal produces updates for inner nodes");

// BUG 6 — autosave-style merge preserves undo stack and viewport
let history = createHistoryState(createInitialBuilderState(baseDocument));
history = historyReducer(history, { type: "ADD_NODE", node: createBuilderNode("delay", { x: 100, y: 200 }) });
history = historyReducer(history, { type: "SELECT_NODES", nodeIds: ["n2"] });
const pastLength = history.past.length;
const savedDocument: WorkflowDocument = {
  ...baseDocument,
  nodes: history.present.document.nodes,
  edges: history.present.document.edges,
};
const merged = mergePersistedState(history, savedDocument, ["n2"]);
assert.equal(merged.past.length, pastLength);
assert.equal(merged.present.document.viewport.zoom, 1.4);
assert.deepEqual(merged.present.selectedNodeIds, ["n2"]);
assert.equal(merged.present.saveStatus, "saved");
console.log("  ✓ autosave merge preserves undo history, viewport, and selection");

// BUG 7 — selection survives config edits, alignment, and save-status changes
let selected = builderReducer(
  { ...createInitialBuilderState(baseDocument), selectedNodeIds: ["n2"] },
  { type: "UPDATE_NODE_CONFIG", nodeId: "n2", patch: { message: "Updated" } },
);
assert.deepEqual(selected.selectedNodeIds, ["n2"]);

selected = builderReducer(selected, { type: "UPDATE_NODE_POSITIONS", positions: leftUpdates });
assert.deepEqual(selected.selectedNodeIds, ["n2"]);

selected = builderReducer(selected, { type: "SET_SAVE_STATUS", status: "saving" });
assert.deepEqual(selected.selectedNodeIds, ["n2"]);
console.log("  ✓ selection survives config edits, alignment, and save-status updates");

// BUG 7 — selection clears only on explicit deselect or delete
const deselected = builderReducer(selected, { type: "SELECT_NODES", nodeIds: [] });
assert.deepEqual(deselected.selectedNodeIds, []);
const deleted = builderReducer(
  { ...createInitialBuilderState(baseDocument), selectedNodeIds: ["n2"] },
  { type: "DELETE_NODES", nodeIds: ["n2"] },
);
assert.deepEqual(deleted.selectedNodeIds, []);
console.log("  ✓ selection clears on explicit deselect and delete");

// BUG 4 — every registered node exposes a property editor and default config
for (const definition of listWorkflowNodeDefinitions()) {
  assert.ok(definition.PropertyEditor, `${definition.id} missing PropertyEditor`);
  assert.ok(definition.defaultConfig, `${definition.id} missing defaultConfig`);
  const node = createBuilderNode(definition.id, { x: 0, y: 0 }, `${definition.id}-test`);
  const issues = definition.validate?.(node.config, node.id) ?? [];
  assert.ok(Array.isArray(issues), `${definition.id} validate must return an array`);
}
console.log("  ✓ all registered nodes expose editors and validatable defaults");

// BUG 5/1 — variable providers remain available while builder state mutates
const beforeCount = history.present.document.nodes.length;
history = historyReducer(history, {
  type: "UPDATE_NODE_CONFIG",
  nodeId: "n2",
  patch: { message: "Hello {{customer.name}}" },
});
assert.equal(history.present.document.nodes.length, beforeCount);
assert.ok(getWorkflowNodeDefinition("send_message"));
console.log("  ✓ property edits mutate config without dropping nodes");

// BUG 8 — hydrate persisted UI state contract
type PersistedUiState = { viewport: WorkflowDocument["viewport"]; selectedNodeIds: string[] };
function hydrate(document: WorkflowDocument, persisted: PersistedUiState | null): BuilderState {
  const initial = createInitialBuilderState(document);
  if (!persisted) return initial;
  return {
    ...initial,
    document: { ...initial.document, viewport: persisted.viewport ?? initial.document.viewport },
    selectedNodeIds: persisted.selectedNodeIds.filter((id) => document.nodes.some((node) => node.id === id)),
  };
}
const hydrated = hydrate(baseDocument, { viewport: { x: 5, y: 6, zoom: 2 }, selectedNodeIds: ["n3", "missing"] });
assert.equal(hydrated.document.viewport.zoom, 2);
assert.deepEqual(hydrated.selectedNodeIds, ["n3"]);
console.log("  ✓ refresh hydration restores viewport and valid selection");

// Undo still works after non-history save-status updates
history = createHistoryState(createInitialBuilderState(baseDocument));
history = historyReducer(history, { type: "ADD_NODE", node: createBuilderNode("delay", { x: 0, y: 0 }) });
const afterUndo = undoHistory(history);
assert.equal(afterUndo.present.document.nodes.length, baseDocument.nodes.length);
console.log("  ✓ undo stack remains usable after builder edits");

// S1.1 — alignment produces a signature change consumable by canvas render
const beforeSig = documentNodeSignature(spreadNodes);
const afterAlign = builderReducer(
  { ...createInitialBuilderState({ ...baseDocument, nodes: spreadNodes }), selectedNodeIds: ["spread-1", "spread-2", "spread-3"] },
  { type: "UPDATE_NODE_POSITIONS", positions: leftUpdates },
);
const afterSig = documentNodeSignature(afterAlign.document.nodes);
assert.notEqual(beforeSig, afterSig);
console.log("  ✓ alignment mutates document node signature for canvas sync");

// S1.1 — drag commits only when dragging ends (position change with dragging=false)
assert.deepEqual(
  extractDragCommitPositions([
    { type: "position", id: "n1", position: { x: 10, y: 20 }, dragging: true },
  ]),
  [],
);
assert.deepEqual(
  extractDragCommitPositions([
    { type: "position", id: "n1", position: { x: 10, y: 20 }, dragging: false },
  ]),
  [{ id: "n1", x: 10, y: 20 }],
);
console.log("  ✓ drag commits document positions only after drag ends");

// Controlled mirror allow-list: select + dimensions + transient position.
const mixedDragChanges = [
  { type: "dimensions", id: "n1", dimensions: { width: 240, height: 88 } },
  { type: "position", id: "n1", position: { x: 10, y: 20 }, dragging: true },
  { type: "select", id: "n1", selected: true },
  { type: "replace", id: "n1", item: { id: "n1", type: "workflowNode", position: { x: 0, y: 0 }, data: {} } },
] as const;
const mirrorDuringDrag = filterControlledMirrorNodeChanges([...mixedDragChanges]);
assert.equal(mirrorDuringDrag.length, 3);
assert.deepEqual(
  mirrorDuringDrag.map((change) => change.type),
  ["dimensions", "position", "select"],
);

const runtimeOnlyDuringDrag = filterRuntimeApplyNodeChanges([...mixedDragChanges]);
assert.equal(runtimeOnlyDuringDrag.length, 2);
assert.deepEqual(
  runtimeOnlyDuringDrag.map((change) => change.type),
  ["dimensions", "select"],
);

const dragEndChanges = [
  { type: "position", id: "n1", position: { x: 10, y: 20 }, dragging: false },
  { type: "select", id: "n1", selected: true },
  { type: "add", id: "n9", item: { id: "n9", type: "workflowNode", position: { x: 0, y: 0 }, data: {} } },
] as const;
const mirrorOnDragEnd = filterControlledMirrorNodeChanges([...dragEndChanges]);
assert.equal(mirrorOnDragEnd.length, 2);
assert.deepEqual(
  mirrorOnDragEnd.map((change) => change.type),
  ["position", "select"],
);
const runtimeOnlyOnDragEnd = filterRuntimeApplyNodeChanges([...dragEndChanges]);
assert.equal(runtimeOnlyOnDragEnd.length, 1);
assert.equal(runtimeOnlyOnDragEnd[0]?.type, "select");
console.log("  ✓ runtime semantic filter remains select + dimensions only");

// Commit 6 — bounded seed trigger tracks full document projection, not runtime fields.
const projectionBase = documentToFlowNodes(
  baseDocument.nodes,
  ["n2"],
  (_id, _field, fallback) => fallback,
  undefined,
);

const dragMirror = applyNodeChanges(
  [{ type: "position", id: "n2", position: { x: 400, y: 200 }, dragging: true }],
  projectionBase,
) as FlowNode[];
assert.equal(dragMirror.find((node) => node.id === "n2")?.position.x, 400);
console.log("  ✓ controlled mirror applies transient position during drag");
const projectionSig = documentProjectionSignature(projectionBase);
assert.ok(projectionSig.includes("n2:320,40:1"), "projection signature encodes position and selection");

const configEdited = builderReducer(createInitialBuilderState(baseDocument), {
  type: "UPDATE_NODE_CONFIG",
  nodeId: "n2",
  patch: { message: "Updated subtitle" },
});
const projectionAfterConfig = documentToFlowNodes(
  configEdited.document.nodes,
  configEdited.selectedNodeIds,
  (_id, _field, fallback) => fallback,
  undefined,
);
assert.notEqual(documentProjectionSignature(projectionAfterConfig), projectionSig);

const positionOnlySig = documentNodeSignature(configEdited.document.nodes);
const positionOnlySigBefore = documentNodeSignature(baseDocument.nodes);
assert.equal(positionOnlySig, positionOnlySigBefore, "config edit does not change position-only signature");
assert.notEqual(
  documentProjectionSignature(projectionAfterConfig),
  documentProjectionSignature(projectionBase),
  "config edit changes projection signature for seed",
);
console.log("  ✓ documentProjectionSignature triggers seed on config changes, not runtime dimensions");

// Seed audit — subtitle-only updates preserve unchanged node identity.
const measuredProjection = documentToFlowNodes(
  baseDocument.nodes,
  ["n2"],
  (_id, _field, fallback) => fallback,
  undefined,
).map((node) => ({
  ...node,
  measured: { width: 240, height: 88 },
}));
const subtitleOnlyProjection = measuredProjection.map((node) =>
  node.id === "n2"
    ? { ...node, data: { ...node.data, subtitle: "Updated subtitle" } }
    : node,
);
const seededSubtitle = seedControlledNodesFromDocument(measuredProjection, subtitleOnlyProjection);
assert.equal(seededSubtitle.find((node) => node.id === "n1"), measuredProjection.find((node) => node.id === "n1"));
assert.notEqual(seededSubtitle.find((node) => node.id === "n2"), measuredProjection.find((node) => node.id === "n2"));
assert.equal(seededSubtitle.find((node) => node.id === "n2")?.data.subtitle, "Updated subtitle");
assert.equal(seededSubtitle.find((node) => node.id === "n2")?.measured?.width, 240);
assert.equal(seededSubtitle.find((node) => node.id === "n3"), measuredProjection.find((node) => node.id === "n3"));
console.log("  ✓ subtitle-only seed preserves unchanged node references and RF measurements");

// Autosave merge — in-flight edits stay live when save completes dirty.
let autosaveHistory = createHistoryState(createInitialBuilderState(baseDocument));
autosaveHistory = historyReducer(autosaveHistory, { type: "SET_SAVE_STATUS", status: "saving" });
autosaveHistory = historyReducer(autosaveHistory, {
  type: "UPDATE_NODE_CONFIG",
  nodeId: "n2",
  patch: { message: "Typed during save" },
});
const savedDuringTyping = {
  ...baseDocument,
  nodes: baseDocument.nodes.map((node, index) => ({
    ...node,
    id: index === 1 ? "n2-saved" : node.id,
    config: index === 1 ? { ...node.config, message: "Stale snapshot" } : node.config,
  })),
};
const preserved = applyPersistedSaveResult(autosaveHistory, savedDuringTyping);
assert.equal(
  preserved.present.document.nodes.find((node) => node.id === "n2")?.config.message,
  "Typed during save",
);
assert.equal(preserved.present.saveStatus, "dirty");
console.log("  ✓ autosave merge preserves in-flight config edits");

// Stable editor identity survives save-time id remap.
const nodeWithClientKey = createBuilderNode("send_message", { x: 0, y: 0 }, "runtime-id");
const remappedAfterSave = { ...nodeWithClientKey, id: "persisted-id" };
assert.equal(resolveBuilderNodeEditorKey(nodeWithClientKey), resolveBuilderNodeEditorKey(remappedAfterSave));
assert.notEqual(nodeWithClientKey.id, remappedAfterSave.id);
console.log("  ✓ property editor key stays stable across save id remap");

// S1.2 — seed preserves RF measurements when document is unchanged
const flowFromDoc = documentToFlowNodes(
  baseDocument.nodes,
  ["n2"],
  (_id, _field, fallback) => fallback,
  undefined,
);
const rfMeasured = flowFromDoc.map((node) => ({
  ...node,
  measured: { width: 240, height: 88 },
  width: 240,
  height: 88,
}));
assert.equal(seedControlledNodesFromDocument(rfMeasured, flowFromDoc), rfMeasured);
console.log("  ✓ seed returns same reference when document nodes are unchanged");

const flowWithNewSelection = documentToFlowNodes(
  baseDocument.nodes,
  ["n1", "n3"],
  (_id, _field, fallback) => fallback,
  undefined,
);
const seededSelection = seedControlledNodesFromDocument(rfMeasured, flowWithNewSelection);
assert.notEqual(seededSelection, rfMeasured);
assert.equal(seededSelection.find((node) => node.id === "n1")?.selected, true);
assert.equal(seededSelection.find((node) => node.id === "n1")?.measured?.width, 240);
console.log("  ✓ seed updates selection while preserving RF measurements");

// Controlled canvas — RF nodes derive synchronously from document
const documentNodes = documentToFlowNodes(
  baseDocument.nodes,
  ["n2"],
  (_id, _field, fallback) => fallback,
  undefined,
);
assert.equal(documentNodes.find((node) => node.id === "n2")?.position.x, 320);
console.log("  ✓ canvas nodes derive synchronously from builder document");

const alignedHistory = historyReducer(createHistoryState(createInitialBuilderState(baseDocument)), {
  type: "UPDATE_NODE_POSITIONS",
  positions: leftUpdates,
});
const alignedNodes = documentToFlowNodes(
  alignedHistory.present.document.nodes,
  alignedHistory.present.selectedNodeIds,
  (_id, _field, fallback) => fallback,
  undefined,
);
assert.equal(
  alignedNodes.find((node) => node.id === "n2")?.position.x,
  alignedHistory.present.document.nodes.find((node) => node.id === "n2")?.position.x,
);
console.log("  ✓ alignment updates rendered node positions on the same document revision");

const committedDrag = historyReducer(createHistoryState(createInitialBuilderState(baseDocument)), {
  type: "UPDATE_NODE_POSITIONS",
  positions: [{ id: "n2", x: 520, y: 520 }],
});
assert.equal(committedDrag.past.length, 1);
console.log("  ✓ drag-end position commit creates one undo step");

const undone = undoHistory(committedDrag);
assert.equal(undone.present.document.nodes.find((node) => node.id === "n2")?.position.x, 320);
console.log("  ✓ undo restores document-driven canvas positions");

// S1.1 — builder init keyed by flowId only (session cache survives document prop refresh)
const sessionCache = new Map<string, ReturnType<typeof createHistoryState>>();
const flowA = "flow-a";
const edited = historyReducer(createHistoryState(createInitialBuilderState(baseDocument)), {
  type: "UPDATE_NODE_CONFIG",
  nodeId: "n2",
  patch: { message: "Live edit" },
});
sessionCache.set(flowA, edited);
const restored = sessionCache.get(flowA);
assert.equal(
  restored?.present.document.nodes.find((node) => node.id === "n2")?.config.message,
  "Live edit",
);
console.log("  ✓ builder session cache survives document prop refresh");

const identity = createAuthIdentitySnapshot("user-1", "company-1", [{ id: "role-a" }, { id: "role-b" }]);
assert.equal(
  shouldSkipTokenRefreshReload({
    loadedUserId: "user-1",
    nextUserId: "user-1",
    hasProfile: true,
    loadedIdentity: identity,
    profileCompanyId: "company-1",
    roles: [{ id: "role-b" }, { id: "role-a" }],
  }),
  true,
);
assert.equal(
  shouldSkipTokenRefreshReload({
    loadedUserId: "user-1",
    nextUserId: "user-1",
    hasProfile: true,
    loadedIdentity: identity,
    profileCompanyId: "company-2",
    roles: [{ id: "role-a" }],
  }),
  false,
);
assert.equal(
  shouldSkipTokenRefreshReload({
    loadedUserId: "user-1",
    nextUserId: "user-2",
    hasProfile: true,
    loadedIdentity: identity,
    profileCompanyId: "company-1",
    roles: [{ id: "role-a" }],
  }),
  false,
);
console.log("  ✓ token refresh skips RBAC reload when identity is unchanged");

assert.equal(selectionKey(["n2", "n1"]), selectionKey(["n1", "n2"]));
assert.notEqual(selectionKey(["n1"]), selectionKey(["n1", "n2"]));
console.log("  ✓ selection keys compare stably");

assert.equal(
  isAuthUserVisibleEqual(
    { user: { id: "u1", email: "a@b.c", role: "authenticated" } } as never,
    { user: { id: "u1", email: "a@b.c", role: "authenticated" }, access_token: "new" } as never,
  ),
  true,
);
assert.equal(
  isAuthUserVisibleEqual(
    { user: { id: "u1", email: "a@b.c", role: "authenticated" } } as never,
    { user: { id: "u2", email: "a@b.c", role: "authenticated" } } as never,
  ),
  false,
);
console.log("  ✓ token-only session refresh preserves user-visible auth identity");

// ---------------------------------------------------------------------------
// Commit 8 — synchronization architecture invariants
// ---------------------------------------------------------------------------

type FlowNode = Node<WorkflowNodeData>;

const stableNodeText = (_id: string, _field: "displayName" | "description", fallback: string) => fallback;

function flowNodesFromState(state: BuilderState): FlowNode[] {
  return documentToFlowNodes(state.document.nodes, state.selectedNodeIds, stableNodeText, undefined);
}

function reconcileDocumentToControlled(state: BuilderState, current: FlowNode[] = []): FlowNode[] {
  return seedControlledNodesFromDocument(current, flowNodesFromState(state));
}

function assertControlledMatchesDocumentProjection(state: BuilderState, controlled: FlowNode[]) {
  const projection = flowNodesFromState(state);
  assert.equal(controlled.length, projection.length, "controlled node count matches document");
  assert.equal(documentProjectionSignature(controlled), documentProjectionSignature(projection));
  for (const flowNode of projection) {
    const node = controlled.find((entry) => entry.id === flowNode.id);
    assert.ok(node, `controlled node ${flowNode.id} exists`);
    assert.equal(node.position.x, flowNode.position.x);
    assert.equal(node.position.y, flowNode.position.y);
    assert.equal(node.selected, flowNode.selected);
    assert.equal(node.data.label, flowNode.data.label);
    assert.equal(node.data.subtitle, flowNode.data.subtitle);
  }
}

assert.deepEqual([...CONTROLLED_MIRROR_CHANGE_TYPES], ["select", "dimensions", "position"]);
assert.deepEqual([...RUNTIME_APPLY_NODE_CHANGE_TYPES], ["select", "dimensions"]);
assert.equal(isControlledMirrorNodeChange({ type: "select", id: "n1", selected: true }), true);
assert.equal(isControlledMirrorNodeChange({ type: "dimensions", id: "n1", dimensions: { width: 1, height: 1 } }), true);
assert.equal(isControlledMirrorNodeChange({ type: "position", id: "n1", position: { x: 0, y: 0 }, dragging: true }), true);
assert.equal(isRuntimeApplyNodeChange({ type: "position", id: "n1", position: { x: 0, y: 0 }, dragging: true }), false);
assert.equal(isRuntimeApplyNodeChange({ type: "position", id: "n1", position: { x: 0, y: 0 }, dragging: false }), false);
assert.equal(
  filterControlledMirrorNodeChanges([
    { type: "position", id: "n1", position: { x: 1, y: 2 }, dragging: true },
    { type: "position", id: "n1", position: { x: 1, y: 2 }, dragging: false },
    { type: "remove", id: "n1" },
  ]).length,
  2,
);
assert.equal(
  filterRuntimeApplyNodeChanges([
    { type: "position", id: "n1", position: { x: 1, y: 2 }, dragging: true },
    { type: "position", id: "n1", position: { x: 1, y: 2 }, dragging: false },
    { type: "remove", id: "n1" },
  ]).length,
  0,
);
console.log("  ✓ controlled mirror allow-list accepts position; semantic filter rejects it");

const dragCommitPositions = extractDragCommitPositions([
  { type: "position", id: "n2", position: { x: 400, y: 200 }, dragging: false },
]);
assert.deepEqual(dragCommitPositions, [{ id: "n2", x: 400, y: 200 }]);
const dragCommittedState = builderReducer(createInitialBuilderState(baseDocument), {
  type: "UPDATE_NODE_POSITIONS",
  positions: dragCommitPositions,
});
const dragCommittedControlled = reconcileDocumentToControlled(dragCommittedState);
assert.equal(dragCommittedControlled.find((node) => node.id === "n2")?.position.x, 400);
console.log("  ✓ drag commit routes through UPDATE_NODE_POSITIONS then seed");

const projectionForDims = flowNodesFromState(createInitialBuilderState(baseDocument));
const sigBeforeDims = documentProjectionSignature(projectionForDims);
const runtimeMeasured = applyNodeChanges(
  [{ type: "dimensions", id: "n2", dimensions: { width: 320, height: 120 } }],
  projectionForDims,
) as FlowNode[];
assert.equal(documentProjectionSignature(runtimeMeasured), sigBeforeDims);
assert.equal(runtimeMeasured.find((node) => node.id === "n2")?.measured?.width, 320);
const reseededAfterDims = seedControlledNodesFromDocument(runtimeMeasured, projectionForDims);
assert.equal(reseededAfterDims, runtimeMeasured, "seed is no-op when document projection unchanged");
console.log("  ✓ runtime dimensions do not trigger document reconciliation");

let pipelineHistory = createHistoryState(createInitialBuilderState(baseDocument));
let pipelineControlled: FlowNode[] = reconcileDocumentToControlled(pipelineHistory.present);

pipelineHistory = historyReducer(pipelineHistory, {
  type: "ADD_NODE",
  node: createBuilderNode("delay", { x: 180, y: 180 }, "pipe-add"),
});
pipelineControlled = reconcileDocumentToControlled(pipelineHistory.present, pipelineControlled);
assertControlledMatchesDocumentProjection(pipelineHistory.present, pipelineControlled);

pipelineHistory = historyReducer(pipelineHistory, {
  type: "SELECT_NODES",
  nodeIds: ["n2"],
});
pipelineHistory = historyReducer(pipelineHistory, {
  type: "DUPLICATE_NODES",
  nodeIds: ["n2"],
});
pipelineControlled = reconcileDocumentToControlled(pipelineHistory.present, pipelineControlled);
assertControlledMatchesDocumentProjection(pipelineHistory.present, pipelineControlled);
assert.ok(pipelineControlled.length > baseDocument.nodes.length);

pipelineHistory = historyReducer(pipelineHistory, {
  type: "UPDATE_NODE_POSITIONS",
  positions: [{ id: "n2", x: 360, y: 80 }],
});
pipelineControlled = reconcileDocumentToControlled(pipelineHistory.present, pipelineControlled);
assertControlledMatchesDocumentProjection(pipelineHistory.present, pipelineControlled);

pipelineHistory = historyReducer(pipelineHistory, {
  type: "DELETE_NODES",
  nodeIds: ["pipe-add"],
});
pipelineControlled = reconcileDocumentToControlled(pipelineHistory.present, pipelineControlled);
assertControlledMatchesDocumentProjection(pipelineHistory.present, pipelineControlled);

const movedSnapshot = structuredClone(pipelineHistory.present);
pipelineHistory = undoHistory(pipelineHistory);
pipelineControlled = reconcileDocumentToControlled(pipelineHistory.present, pipelineControlled);
assertControlledMatchesDocumentProjection(pipelineHistory.present, pipelineControlled);

pipelineHistory = redoHistory(pipelineHistory);
pipelineControlled = reconcileDocumentToControlled(pipelineHistory.present, pipelineControlled);
assertControlledMatchesDocumentProjection(pipelineHistory.present, pipelineControlled);
assert.deepEqual(
  pipelineHistory.present.document.nodes.find((node) => node.id === "n2")?.position,
  movedSnapshot.document.nodes.find((node) => node.id === "n2")?.position,
);
console.log("  ✓ document → seed → controlled stays aligned across add/duplicate/move/delete/undo/redo");

const semanticProjection = flowNodesFromState({
  ...createInitialBuilderState(baseDocument),
  selectedNodeIds: ["n2"],
});
const runtimeMirrored = applyNodeChanges(
  [
    { type: "select", id: "n1", selected: true },
    { type: "select", id: "n2", selected: true },
    { type: "select", id: "n3", selected: true },
  ],
  semanticProjection,
) as FlowNode[];
assert.ok(runtimeMirrored.every((node) => node.selected));
const reconciledSelection = seedControlledNodesFromDocument(runtimeMirrored, semanticProjection);
assert.equal(reconciledSelection.find((node) => node.id === "n1")?.selected, false);
assert.equal(reconciledSelection.find((node) => node.id === "n2")?.selected, true);
assert.equal(reconciledSelection.find((node) => node.id === "n3")?.selected, false);
console.log("  ✓ selection runtime mirror and semantic seed remain separated");

// ---------------------------------------------------------------------------
// Commit 2 — BUG-SEL-001 ctrl/cmd additive multi-select semantic commit
// ---------------------------------------------------------------------------

function commitRuntimeSelectionIfDrifted(
  state: BuilderState,
  changes: Parameters<typeof applyNodeChanges>[0],
  controlled: FlowNode[],
): BuilderState {
  const runtimeChanges = filterRuntimeApplyNodeChanges(changes);
  if (!runtimeChanges.some((change) => change.type === "select")) return state;

  const runtimeSelectedIds = applyNodeChanges(runtimeChanges, controlled)
    .filter((node) => node.selected)
    .map((node) => node.id);

  if (selectionKey(runtimeSelectedIds) === selectionKey(state.selectedNodeIds)) return state;
  return builderReducer(state, { type: "SELECT_NODES", nodeIds: runtimeSelectedIds });
}

function applyRuntimeSelectChanges(controlled: FlowNode[], changes: Parameters<typeof applyNodeChanges>[0]): FlowNode[] {
  const runtimeChanges = filterRuntimeApplyNodeChanges(changes);
  return runtimeChanges.length > 0 ? (applyNodeChanges(runtimeChanges, controlled) as FlowNode[]) : controlled;
}

let selState = createInitialBuilderState(baseDocument);
let selControlled = reconcileDocumentToControlled(selState);

selState = commitRuntimeSelectionIfDrifted(
  selState,
  [
    { type: "select", id: "n1", selected: true },
    { type: "select", id: "n2", selected: false },
    { type: "select", id: "n3", selected: false },
  ],
  selControlled,
);
selControlled = applyRuntimeSelectChanges(selControlled, [
  { type: "select", id: "n1", selected: true },
  { type: "select", id: "n2", selected: false },
  { type: "select", id: "n3", selected: false },
]);
assert.deepEqual(selState.selectedNodeIds, ["n1"]);

selState = commitRuntimeSelectionIfDrifted(
  selState,
  [{ type: "select", id: "n2", selected: true }],
  selControlled,
);
selControlled = applyRuntimeSelectChanges(selControlled, [{ type: "select", id: "n2", selected: true }]);
assert.deepEqual(selState.selectedNodeIds, ["n1", "n2"]);
assertControlledMatchesDocumentProjection(selState, reconcileDocumentToControlled(selState, selControlled));
console.log("  ✓ ctrl additive multi-select commits semantic selection from runtime truth");

selState = commitRuntimeSelectionIfDrifted(
  selState,
  [
    { type: "select", id: "n3", selected: true },
    { type: "select", id: "n1", selected: true },
  ],
  selControlled,
);
selControlled = applyRuntimeSelectChanges(selControlled, [
  { type: "select", id: "n3", selected: true },
  { type: "select", id: "n1", selected: true },
]);
assert.deepEqual(selState.selectedNodeIds, ["n1", "n2", "n3"]);
console.log("  ✓ ctrl multi-select across several clicks keeps document aligned with runtime");

selState = commitRuntimeSelectionIfDrifted(
  selState,
  [
    { type: "select", id: "n2", selected: true },
    { type: "select", id: "n1", selected: false },
    { type: "select", id: "n3", selected: false },
  ],
  selControlled,
);
selControlled = applyRuntimeSelectChanges(selControlled, [
  { type: "select", id: "n2", selected: true },
  { type: "select", id: "n1", selected: false },
  { type: "select", id: "n3", selected: false },
]);
assert.deepEqual(selState.selectedNodeIds, ["n2"]);
console.log("  ✓ single-click replace selection remains unchanged");

const boxState = createInitialBuilderState(baseDocument);
let boxControlled = reconcileDocumentToControlled(boxState);
const boxChanges = [
  { type: "select", id: "n1", selected: true },
  { type: "select", id: "n2", selected: true },
  { type: "select", id: "n3", selected: false },
] as const;
const boxNextState = commitRuntimeSelectionIfDrifted(boxState, [...boxChanges], boxControlled);
boxControlled = applyRuntimeSelectChanges(boxControlled, [...boxChanges]);
assert.deepEqual(boxNextState.selectedNodeIds, ["n1", "n2"]);
assertControlledMatchesDocumentProjection(boxNextState, reconcileDocumentToControlled(boxNextState, boxControlled));
console.log("  ✓ box selection batch commits full runtime selection");

let selHistory = createHistoryState(createInitialBuilderState(baseDocument));
let selHistoryControlled = reconcileDocumentToControlled(selHistory.present);
const selectN2 = [{ type: "select", id: "n2", selected: true }] as const;
selHistory = {
  ...selHistory,
  present: commitRuntimeSelectionIfDrifted(selHistory.present, selectN2, selHistoryControlled),
};
selHistoryControlled = applyRuntimeSelectChanges(selHistoryControlled, selectN2);
selHistory = historyReducer(selHistory, {
  type: "UPDATE_NODE_POSITIONS",
  positions: [{ id: "n2", x: 400, y: 120 }],
});
selHistoryControlled = reconcileDocumentToControlled(selHistory.present, selHistoryControlled);
const selUndone = undoHistory(selHistory);
const selUndoneControlled = reconcileDocumentToControlled(selUndone.present, selHistoryControlled);
assert.deepEqual(selUndone.present.selectedNodeIds, ["n2"]);
assertControlledMatchesDocumentProjection(selUndone.present, selUndoneControlled);
const selRedone = redoHistory(selUndone);
const selRedoneControlled = reconcileDocumentToControlled(selRedone.present, selUndoneControlled);
assertControlledMatchesDocumentProjection(selRedone.present, selRedoneControlled);
console.log("  ✓ undo/redo preserves selection after runtime semantic commit");

const importedDocument: WorkflowDocument = {
  ...baseDocument,
  flowId: "flow-imported",
  nodes: [
    createBuilderNode("start", { x: 80, y: 20 }, "i1"),
    createBuilderNode("send_message", { x: 360, y: 60 }, "i2"),
  ],
  edges: [createEdgeFromNodes("i1", "i2")],
};
const importedState = createInitialBuilderState(importedDocument);
importedState.selectedNodeIds = ["i2"];
let importControlled = reconcileDocumentToControlled(importedState);
importControlled = applyRuntimeSelectChanges(importControlled, [{ type: "select", id: "i1", selected: true }]);
const importCommitted = commitRuntimeSelectionIfDrifted(
  importedState,
  [{ type: "select", id: "i1", selected: true }],
  reconcileDocumentToControlled(importedState),
);
assert.deepEqual(importCommitted.selectedNodeIds, ["i1", "i2"]);
assertControlledMatchesDocumentProjection(importCommitted, reconcileDocumentToControlled(importCommitted, importControlled));
console.log("  ✓ import hydration selection stays aligned after additive runtime select");

const resetState = createInitialBuilderState(baseDocument);
resetState.selectedNodeIds = ["n1", "n2"];
let resetControlled = reconcileDocumentToControlled(resetState);
const resetReplace = builderReducer(resetState, {
  type: "REPLACE_STATE",
  state: createInitialBuilderState(baseDocument),
});
resetControlled = reconcileDocumentToControlled(resetReplace, resetControlled);
const resetCommitted = commitRuntimeSelectionIfDrifted(
  resetReplace,
  [{ type: "select", id: "n3", selected: true }],
  resetControlled,
);
resetControlled = applyRuntimeSelectChanges(resetControlled, [{ type: "select", id: "n3", selected: true }]);
assert.deepEqual(resetCommitted.selectedNodeIds, ["n3"]);
assertControlledMatchesDocumentProjection(resetCommitted, reconcileDocumentToControlled(resetCommitted, resetControlled));
console.log("  ✓ reset workflow selection remains correct after runtime select");

const noopNodeText = (_id: string, _field: "displayName" | "description", fallback: string) => fallback;
const noopQuickAdd = () => undefined;

const dropViewport = { x: 12, y: 24, zoom: 1.4 };
const dropPane = { left: 100, top: 200 };
const dropClient = { x: 400, y: 350 };
const viewportAwareDrop = paletteDropFlowPosition(dropClient, dropPane, dropViewport);
const legacyDrop = {
  x: dropClient.x - dropPane.left - 120,
  y: dropClient.y - dropPane.top - 48,
};
assert.notDeepEqual(viewportAwareDrop, legacyDrop);
assert.ok(Math.abs(viewportAwareDrop.x - (clientPointToFlowPosition(dropClient, dropPane, dropViewport).x - PALETTE_DROP_NODE_ANCHOR.x)) < 0.001);
assert.equal(viewportAwareDrop.y, 30);
console.log("  ✓ palette drop converts screen coordinates through viewport transform");

let sidebarDropHistory = createHistoryState(createInitialBuilderState(baseDocument));
const sidebarDroppedNode = createBuilderNode("delay", viewportAwareDrop, "sidebar-drop");
sidebarDropHistory = historyReducer(sidebarDropHistory, { type: "ADD_NODE", node: sidebarDroppedNode });

let quickAddHistory = createHistoryState(createInitialBuilderState(baseDocument));
const quickAddedNode = createBuilderNode("delay", { x: 320, y: 208 }, "quick-add");
quickAddHistory = historyReducer(quickAddHistory, {
  type: "INSERT_NODE_AFTER",
  sourceNodeId: "n2",
  node: quickAddedNode,
});

const sidebarProjection = documentToFlowNodes(
  sidebarDropHistory.present.document.nodes,
  sidebarDropHistory.present.selectedNodeIds,
  noopNodeText,
  noopQuickAdd,
);
const quickAddProjection = documentToFlowNodes(
  quickAddHistory.present.document.nodes,
  quickAddHistory.present.selectedNodeIds,
  noopNodeText,
  noopQuickAdd,
);
const sidebarRfNode = sidebarProjection.find((node) => node.id === "sidebar-drop");
const quickAddRfNode = quickAddProjection.find((node) => node.id === "quick-add");
assert.equal(sidebarRfNode?.type, "workflowNode");
assert.equal(quickAddRfNode?.type, "workflowNode");
assert.equal(typeof sidebarRfNode?.data.onQuickAdd, "function");
assert.equal(typeof quickAddRfNode?.data.onQuickAdd, "function");
assert.equal(
  canConnect({
    sourceId: "n2",
    targetId: "sidebar-drop",
    nodes: sidebarDropHistory.present.document.nodes,
    edges: sidebarDropHistory.present.document.edges,
  }).allowed,
  true,
);
assert.equal(quickAddHistory.present.document.edges.some((edge) => edge.target === "quick-add"), true);
assertControlledMatchesDocumentProjection(
  sidebarDropHistory.present,
  reconcileDocumentToControlled(sidebarDropHistory.present),
);
assertControlledMatchesDocumentProjection(
  quickAddHistory.present,
  reconcileDocumentToControlled(quickAddHistory.present),
);
console.log("  ✓ sidebar ADD_NODE and quick-add INSERT_NODE_AFTER share connection-eligible node projection");

console.log("\nAll workflow builder stability tests passed.\n");
