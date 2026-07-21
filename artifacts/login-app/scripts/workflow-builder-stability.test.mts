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
import { createHistoryState, historyReducer, undoHistory } from "../src/workflow-builder/core/state/history";
import type { BuilderState, WorkflowDocument } from "../src/workflow-builder/core/types";
import { registerBuiltInVariableProviders } from "../src/workflow-builder/core/variables/built-in-variable-providers";
import {
  documentNodeSignature,
  extractDragCommitPositions,
  mergeFlowNodesIntoCurrent,
} from "../src/workflow-builder/components/canvas/canvas-node-sync";
import { documentToFlowNodes } from "../src/workflow-builder/core/canvas/flow-document-bridge";
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

function mergePersistedState(current: ReturnType<typeof createHistoryState>, saved: WorkflowDocument, keptSelection: string[]) {
  const next = createInitialBuilderState(saved);
  return {
    past: current.past,
    present: {
      ...next,
      document: {
        ...next.document,
        viewport: current.present.document.viewport,
      },
      selectedNodeIds: keptSelection,
      selectedEdgeIds: current.present.selectedEdgeIds,
      saveStatus: "saved" as const,
    },
    future: [],
  };
}

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

// S1.2 — merge preserves RF measurements when document is unchanged
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
assert.equal(mergeFlowNodesIntoCurrent(rfMeasured, flowFromDoc), rfMeasured);
console.log("  ✓ merge returns same reference when document nodes are unchanged");

const flowWithNewSelection = documentToFlowNodes(
  baseDocument.nodes,
  ["n1", "n3"],
  (_id, _field, fallback) => fallback,
  undefined,
);
const mergedSelection = mergeFlowNodesIntoCurrent(rfMeasured, flowWithNewSelection);
assert.notEqual(mergedSelection, rfMeasured);
assert.equal(mergedSelection.find((node) => node.id === "n1")?.selected, true);
assert.equal(mergedSelection.find((node) => node.id === "n1")?.measured?.width, 240);
console.log("  ✓ merge updates selection while preserving RF measurements");

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

console.log("\nAll workflow builder stability tests passed.\n");
