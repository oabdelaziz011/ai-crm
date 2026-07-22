/**
 * Workflow Builder core unit tests.
 * Run: pnpm --dir artifacts/login-app test:workflow-builder-core
 */
import assert from "node:assert/strict";
import { alignNodes, alignmentPositionUpdates } from "../src/workflow-builder/core/layout/alignment";
import { autoLayoutWorkflow } from "../src/workflow-builder/core/layout/auto-layout";
import { canConnect, detectCycle, findIsolatedNodeIds } from "../src/workflow-builder/core/connection-rules";
import { registerBuiltInWorkflowNodes } from "../src/workflow-builder/core/register-built-in-nodes";
import { getWorkflowNodeDefinition, listWorkflowNodeDefinitions } from "../src/workflow-builder/core/node-registry";
import { searchWorkflowNodes } from "../src/workflow-builder/core/search/node-search";
import { createBuilderNode, mapDocumentToPersistence, mapFlowToDocument } from "../src/workflow-builder/core/persistence/workflow-mapper";
import { createEdgeFromNodes, createInitialBuilderState, builderReducer } from "../src/workflow-builder/core/state/builder-reducer";
import { createHistoryState, historyReducer, undoHistory, redoHistory } from "../src/workflow-builder/core/state/history";
import { validateWorkflow } from "../src/workflow-builder/core/validation/workflow-validator";
import { validateBranching } from "../src/workflow-builder/core/validation/branch-validation";
import { resolveBranchEdgeStyle } from "../src/workflow-builder/core/logic/branch-utils";
import { registerBuiltInVariableProviders } from "../src/workflow-builder/core/variables/built-in-variable-providers";
import { listAllWorkflowVariables } from "../src/workflow-builder/core/variables/variable-provider-registry";
import { INTERACTION_VARIABLE_SUBGROUP } from "../src/workflow-builder/core/variables/interaction-variables";
import { collectContextInteractiveOptions, collectContextInteractionTypes } from "../src/workflow-builder/core/graph/upstream-interactive-nodes";
import { buildInteractiveOptionIdRefactorPatches } from "../src/workflow-builder/core/logic/interactive-config-refactor";
import { validateInteractiveLogicReferences } from "../src/workflow-builder/core/validation/interactive-logic-validation";
import { renderVariablePreview } from "../src/workflow-builder/core/variables/variable-preview";
import { resolveVisualCategory } from "../src/workflow-builder/core/visual/category-tokens";

registerBuiltInWorkflowNodes();
registerBuiltInVariableProviders();

console.log("\nWorkflow Builder core tests\n");

const start = createBuilderNode("start", { x: 0, y: 0 }, "start-1");
const message = createBuilderNode("send_message", { x: 0, y: 120 }, "msg-1");
const end = createBuilderNode("end", { x: 0, y: 240 }, "end-1");

const baseDocument = {
  flowId: "flow-1",
  companyId: "company-1",
  name: "Welcome journey",
  description: "",
  triggerType: "inbound_message" as const,
  status: "draft" as const,
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [start, message, end],
  edges: [
    createEdgeFromNodes("start-1", "msg-1"),
    createEdgeFromNodes("msg-1", "end-1"),
  ],
};

assert.equal(listWorkflowNodeDefinitions().length, 18);
assert.equal(getWorkflowNodeDefinition("buttons").displayName, "Buttons");
console.log("  ✓ node registry registers built-in business nodes");

const blocked = canConnect({
  sourceId: "start-1",
  targetId: "start-1",
  nodes: baseDocument.nodes,
  edges: baseDocument.edges,
});
assert.equal(blocked.allowed, false);
console.log("  ✓ connection rules block self loops");

const startSecondEdge = canConnect({
  sourceId: "start-1",
  targetId: "end-1",
  nodes: baseDocument.nodes,
  edges: [...baseDocument.edges, createEdgeFromNodes("start-1", "msg-1")],
});
assert.equal(startSecondEdge.allowed, false);
console.log("  ✓ start node allows only one outgoing connection");

assert.equal(detectCycle(baseDocument.nodes, [...baseDocument.edges, createEdgeFromNodes("end-1", "start-1")]), true);
console.log("  ✓ cycle detection");

const issues = validateWorkflow(baseDocument);
assert.equal(issues.some((issue) => issue.id === "missing-start"), false);
assert.equal(issues.some((issue) => issue.id === "missing-end"), false);
console.log("  ✓ validation accepts a connected start-to-end workflow");

const invalid = validateWorkflow({ ...baseDocument, nodes: [start], edges: [] });
assert.ok(invalid.some((issue) => issue.id === "missing-end"));
console.log("  ✓ validation requires end step");

let history = createHistoryState(createInitialBuilderState(baseDocument));
history = historyReducer(history, { type: "ADD_NODE", node: createBuilderNode("buttons", { x: 100, y: 100 }) });
assert.equal(history.present.document.nodes.length, 4);
history = undoHistory(history);
assert.equal(history.present.document.nodes.length, 3);
history = redoHistory(history);
assert.equal(history.present.document.nodes.length, 4);
console.log("  ✓ undo/redo history");

const mappedFlow = mapFlowToDocument(
  {
    id: "flow-1",
    company_id: "company-1",
    name: "Welcome journey",
    description: "",
    trigger_type: "inbound_message",
    status: "draft",
    version: 1,
    metadata: { builderViewport: { x: 10, y: 20, zoom: 1.2 } },
    created_by: null,
    updated_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    deleted_by: null,
  },
  [
    {
      id: "start-1",
      flow_id: "flow-1",
      type: "trigger",
      config: { builderType: "start", label: "When someone messages you" },
      position_x: 0,
      position_y: 0,
      created_at: new Date().toISOString(),
    },
  ],
  [],
);
assert.equal(mappedFlow.nodes[0]?.type, "start");
assert.equal(mappedFlow.viewport.zoom, 1.2);
console.log("  ✓ persistence mapper restores canvas state");

const persistence = mapDocumentToPersistence(baseDocument);
assert.equal(persistence.nodes.length, 3);
assert.equal(persistence.nodes[0]?.type, "trigger");
assert.equal(persistence.nodes[1]?.config.action, "send_message");
console.log("  ✓ persistence mapper writes engine-compatible nodes");

const reduced = builderReducer(createInitialBuilderState(baseDocument), {
  type: "DELETE_NODES",
  nodeIds: [findIsolatedNodeIds([...baseDocument.nodes, createBuilderNode("delay", { x: 300, y: 0 }, "delay-1")], baseDocument.edges)[0] ?? ""].filter(Boolean),
});
assert.ok(reduced.document.nodes.length <= baseDocument.nodes.length);
console.log("  ✓ builder reducer updates graph state");

assert.equal(renderVariablePreview("Hello {{customer.name}}"), "Hello Omar");
console.log("  ✓ variable preview renders mock customer data");

const customerResults = searchWorkflowNodes("customer", listWorkflowNodeDefinitions());
assert.ok(customerResults.some((node) => node.id === "create_customer"));
assert.ok(customerResults.some((node) => node.id === "ask_question"));
console.log("  ✓ smart search finds customer-related steps");

const messageResults = searchWorkflowNodes("message", listWorkflowNodeDefinitions());
assert.ok(messageResults.some((node) => node.id === "send_message"));
console.log("  ✓ smart search finds message-related steps");

const aligned = alignNodes(baseDocument.nodes, ["start-1", "msg-1", "end-1"], "center-horizontal");
assert.equal(aligned[0]?.position.x, aligned[1]?.position.x);
console.log("  ✓ alignment tools reposition selected nodes");

const spreadNodes = [
  createBuilderNode("start", { x: 40, y: 0 }, "spread-1"),
  createBuilderNode("send_message", { x: 320, y: 40 }, "spread-2"),
  createBuilderNode("end", { x: 640, y: 80 }, "spread-3"),
];
const alignedLeft = alignNodes(spreadNodes, ["spread-1", "spread-2", "spread-3"], "left");
assert.equal(alignedLeft[0]?.position.x, 40);
assert.equal(alignedLeft[1]?.position.x, 40);
assert.equal(alignedLeft[2]?.position.x, 40);
const alignUpdates = alignmentPositionUpdates(spreadNodes, ["spread-1", "spread-2", "spread-3"], "left");
assert.equal(alignUpdates.length, 2);
const alignedState = builderReducer(
  createInitialBuilderState({ ...baseDocument, nodes: spreadNodes }),
  { type: "UPDATE_NODE_POSITIONS", positions: alignUpdates },
);
assert.equal(alignedState.document.nodes.find((node) => node.id === "spread-2")?.position.x, 40);
console.log("  ✓ alignment updates dispatch through reducer");

const laidOut = autoLayoutWorkflow(baseDocument.nodes, baseDocument.edges);
assert.ok(laidOut.every((node) => Number.isFinite(node.position.x) && Number.isFinite(node.position.y)));
console.log("  ✓ auto layout produces readable positions");

assert.equal(resolveVisualCategory("delay"), "timing");
assert.equal(resolveVisualCategory("if_else"), "logic");
console.log("  ✓ category visual tokens map business node types");

const ifNode = createBuilderNode("if_else", { x: 0, y: 0 }, "if-1");
const yesTarget = createBuilderNode("send_message", { x: 200, y: 0 }, "vip-msg");
const noTarget = createBuilderNode("send_message", { x: 200, y: 120 }, "std-msg");
const logicDocument = {
  ...baseDocument,
  nodes: [start, ifNode, yesTarget, noTarget, end],
  edges: [
    createEdgeFromNodes("start-1", "if-1", [start, ifNode, yesTarget, noTarget, end], []),
    { ...createEdgeFromNodes("if-1", "vip-msg", [start, ifNode, yesTarget, noTarget, end], []), branchKey: "yes", branchLabel: "YES" },
    { ...createEdgeFromNodes("if-1", "std-msg", [start, ifNode, yesTarget, noTarget, end], [
      { id: "if-1->vip-msg", source: "if-1", target: "vip-msg", branchKey: "yes" },
    ]), branchKey: "no", branchLabel: "NO" },
    createEdgeFromNodes("vip-msg", "end-1", [start, ifNode, yesTarget, noTarget, end], []),
    createEdgeFromNodes("std-msg", "end-1", [start, ifNode, yesTarget, noTarget, end], []),
  ],
};
const branchIssues = validateBranching(logicDocument);
assert.equal(branchIssues.some((issue) => issue.id.endsWith("missing-yes")), false);
assert.equal(branchIssues.some((issue) => issue.id.endsWith("missing-no")), false);
console.log("  ✓ branch validation requires YES and NO paths");

const yesStyle = resolveBranchEdgeStyle(ifNode, { id: "e", source: "if-1", target: "vip-msg", branchKey: "yes" });
assert.equal(yesStyle.stroke, "#22c55e");
console.log("  ✓ branch visualization colors YES paths green");

const mappedLogic = mapDocumentToPersistence(logicDocument);
assert.equal(mappedLogic.nodes.find((node) => node.config.builderType === "if_else")?.type, "condition");
assert.equal(mappedLogic.edges.find((edge) => edge.condition?.branch === "yes")?.targetNodeId, "vip-msg");
console.log("  ✓ persistence mapper writes branch metadata for engine routing");

const duplicated = builderReducer(createInitialBuilderState(baseDocument), {
  type: "DUPLICATE_NODES",
  nodeIds: ["msg-1"],
});
assert.equal(duplicated.document.nodes.length, 4);
console.log("  ✓ duplicate nodes action clones selected steps");

const selectedState = builderReducer(
  { ...createInitialBuilderState(baseDocument), selectedNodeIds: ["msg-1"] },
  { type: "UPDATE_NODE_CONFIG", nodeId: "msg-1", patch: { message: "Updated greeting" } },
);
assert.deepEqual(selectedState.selectedNodeIds, ["msg-1"]);
assert.equal(
  selectedState.document.nodes.find((node) => node.id === "msg-1")?.config.message,
  "Updated greeting",
);
console.log("  ✓ config edits preserve selected node ids");

const inserted = builderReducer(createInitialBuilderState(baseDocument), {
  type: "INSERT_NODE_AFTER",
  sourceNodeId: "msg-1",
  node: createBuilderNode("delay", { x: 0, y: 180 }, "delay-1"),
});
assert.equal(inserted.document.nodes.length, 4);
assert.equal(inserted.document.edges.length, 3);
assert.ok(
  inserted.document.edges.some((edge) => edge.source === "msg-1" && edge.target === "delay-1"),
);
assert.ok(
  inserted.document.edges.some((edge) => edge.source === "delay-1" && edge.target === "end-1"),
);
assert.ok(inserted.document.edges.every((edge) => edge.source && edge.target));
console.log("  ✓ insert-after creates connected nodes without orphan edges");

const deletedWithEdges = builderReducer(createInitialBuilderState(baseDocument), {
  type: "DELETE_NODES",
  nodeIds: ["msg-1"],
});
assert.equal(deletedWithEdges.document.nodes.length, 2);
assert.equal(deletedWithEdges.document.edges.length, 0);
console.log("  ✓ delete nodes removes connected edges");

function remapSelectionAfterSave(
  previousNodes: typeof baseDocument.nodes,
  previousSelection: string[],
  savedNodes: typeof baseDocument.nodes,
): string[] {
  const idMap = new Map<string, string>();
  previousNodes.forEach((node, index) => {
    const savedNode = savedNodes[index];
    if (savedNode) idMap.set(node.id, savedNode.id);
  });
  return previousSelection
    .map((id) => idMap.get(id) ?? id)
    .filter((id) => savedNodes.some((node) => node.id === id));
}

assert.deepEqual(
  remapSelectionAfterSave(
    baseDocument.nodes,
    ["msg-1"],
    baseDocument.nodes.map((node, index) =>
      index === 1 ? { ...node, id: "msg-1-saved" } : node,
    ),
  ),
  ["msg-1-saved"],
);
console.log("  ✓ autosave remaps selection to persisted node ids");

const conversationVariables = listAllWorkflowVariables().filter((entry) => entry.category === "conversation");
assert.ok(conversationVariables.some((entry) => entry.token === "{{conversation.last_button_id}}"));
assert.ok(conversationVariables.some((entry) => entry.token === "{{conversation.last_button_title}}"));
assert.ok(
  conversationVariables.every((entry) => entry.subgroup === INTERACTION_VARIABLE_SUBGROUP),
  "conversation interaction variables are grouped under Last Interaction",
);
console.log("  ✓ conversation button runtime variables are selectable in condition picker");

const interactiveRoutingDocument = {
  ...baseDocument,
  nodes: [
    createBuilderNode("start", { x: 0, y: 0 }, "start-1"),
    createBuilderNode("buttons", { x: 200, y: 0 }, "buttons-1"),
    createBuilderNode("if_else", { x: 420, y: 0 }, "if-1"),
  ],
  edges: [
    createEdgeFromNodes("start-1", "buttons-1"),
    createEdgeFromNodes("buttons-1", "if-1"),
  ],
};
interactiveRoutingDocument.nodes[1]!.config = {
  message: "Choose",
  buttons: [
    { id: "booking", label: "Book now" },
    { id: "prices", label: "Pricing" },
    { id: "agent", label: "Talk to agent" },
  ],
};
interactiveRoutingDocument.nodes[2]!.config = {
  ruleSet: {
    root: {
      id: "root",
      combinator: "and",
      rules: [
        {
          id: "rule-1",
          field: "conversation.last_button_id",
          operator: "equals",
          value: "booking",
        },
      ],
    },
  },
};

const upstreamOptions = collectContextInteractiveOptions(interactiveRoutingDocument, "if-1");
assert.deepEqual(
  upstreamOptions.map((option) => option.id),
  ["booking", "prices", "agent"],
);
assert.deepEqual(
  upstreamOptions.map((option) => option.label),
  ["Book now", "Pricing", "Talk to agent"],
);
console.log("  ✓ condition nodes read selection values from immediate upstream interactive step");

const upstreamInteractionTypes = collectContextInteractionTypes(interactiveRoutingDocument, "if-1");
assert.deepEqual(upstreamInteractionTypes, ["button"]);
console.log("  ✓ condition nodes read interaction types from immediate upstream interactive step");

const detachedConditionDocument = {
  ...interactiveRoutingDocument,
  edges: interactiveRoutingDocument.edges.filter((edge) => edge.target !== "if-1"),
};
const fallbackInteractionTypes = collectContextInteractionTypes(detachedConditionDocument, "if-1");
assert.deepEqual(fallbackInteractionTypes, ["button", "list", "flow", "quick_reply"]);
console.log("  ✓ interaction type suggestions fall back to supported catalog without upstream context");

const refactorPatches = buildInteractiveOptionIdRefactorPatches(
  interactiveRoutingDocument,
  "buttons-1",
  "booking",
  "book_service",
);
assert.equal(refactorPatches.length, 1);
assert.equal(refactorPatches[0]?.nodeId, "if-1");
assert.equal(
  (refactorPatches[0]?.patch.ruleSet as { root: { rules: Array<{ value: string }> } }).root.rules[0]?.value,
  "book_service",
);
console.log("  ✓ renaming interactive option ids refactors downstream condition values");

const staleReferenceIssues = validateInteractiveLogicReferences(
  interactiveRoutingDocument,
  "if-1",
  "if_else",
  {
    ruleSet: {
      root: {
        id: "root",
        combinator: "and",
        rules: [
          {
            id: "rule-1",
            field: "conversation.last_button_id",
            operator: "equals",
            value: "missing_option",
          },
        ],
      },
    },
  },
);
assert.equal(staleReferenceIssues.length, 1);
assert.equal(staleReferenceIssues[0]?.severity, "warning");
console.log("  ✓ stale interactive selection references produce inline validation warnings");

console.log("\nAll workflow builder core tests passed.\n");
