/**
 * Workflow Builder render isolation benchmark (Sprint P4 / P4.2).
 * Run: npm run test:workflow-builder-render-perf
 */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { registerBuiltInWorkflowNodes } from "../src/workflow-builder/core/register-built-in-nodes";
import { createBuilderNode } from "../src/workflow-builder/core/persistence/workflow-mapper";
import { createEdgeFromNodes, createInitialBuilderState, builderReducer } from "../src/workflow-builder/core/state/builder-reducer";
import { createHistoryState, historyReducer } from "../src/workflow-builder/core/state/history";
import { documentToFlowEdges, documentToFlowNodes, type StructuralCanvasNode } from "../src/workflow-builder/core/canvas/flow-document-bridge";
import {
  canvasStructuralEdgeSignature,
  canvasStructuralNodeSignature,
  documentPresentationSignature,
  documentTopologySignature,
  documentValidationSignature,
} from "../src/workflow-builder/core/canvas/document-signatures";
import { getSwitchBranchColor } from "../src/workflow-builder/core/logic/branch-utils";
import {
  documentProjectionSignature,
  seedControlledNodesFromDocument,
} from "../src/workflow-builder/components/canvas/canvas-node-sync";
import {
  mergeValidationIssues,
  validateWorkflowNodeConfigs,
  validateWorkflowStructure,
} from "../src/workflow-builder/core/validation/workflow-validator";
import { builderRenderPerf, resetBuilderRenderPerf } from "../src/workflow-builder/debug/builder-render-perf";
import type { ValidationIssue, WorkflowDocument } from "../src/workflow-builder/core/types";

registerBuiltInWorkflowNodes();

function buildDocument(nodeCount: number): WorkflowDocument {
  const nodes = [
    createBuilderNode("start", { x: 0, y: 0 }, "start-1"),
    ...Array.from({ length: nodeCount - 2 }, (_, index) => {
      const id = `msg-${index + 1}`;
      const node = createBuilderNode("send_message", { x: 280, y: index * 140 }, id);
      node.config = { ...node.config, message: `Message ${index + 1}` };
      return node;
    }),
    createBuilderNode("end", { x: 280, y: (nodeCount - 1) * 140 }, "end-1"),
  ];

  const edges = [];
  for (let index = 0; index < nodes.length - 1; index += 1) {
    edges.push(createEdgeFromNodes(nodes[index]!.id, nodes[index + 1]!.id));
  }

  return {
    flowId: "flow-perf",
    companyId: "company-1",
    name: "Perf flow",
    description: "",
    triggerType: "inbound_message",
    status: "draft",
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes,
    edges,
  };
}

function toStructuralNodes(document: WorkflowDocument): StructuralCanvasNode[] {
  return document.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: node.position,
  }));
}

function measure(label: string, fn: () => void, iterations: number): number {
  const start = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    fn();
  }
  const totalMs = performance.now() - start;
  console.log(`  ${label}: ${(totalMs / iterations).toFixed(3)} ms/op (${iterations} iterations)`);
  return totalMs / iterations;
}

console.log("\nWorkflow Builder render perf benchmark (P4.2)\n");

resetBuilderRenderPerf();

const document = buildDocument(30);
const structuralDocumentNodes = toStructuralNodes(document);
const nodeText = (id: string, _field: "displayName" | "description", fallback: string) =>
  id === "send_message" ? "Send Message" : fallback;

let history = createHistoryState(createInitialBuilderState(document));
const topologySig = documentTopologySignature(document);

const baselineStructuralNodeSig = canvasStructuralNodeSignature(structuralDocumentNodes, ["msg-1"]);
const baselineStructuralEdgeSig = canvasStructuralEdgeSignature(structuralDocumentNodes, document.edges);
const baselineProjection = documentToFlowNodes(structuralDocumentNodes, ["msg-1"], undefined);
const baselineStructuralSig = documentProjectionSignature(baselineProjection);

measure("structural node projection (30 nodes)", () => {
  documentToFlowNodes(structuralDocumentNodes, ["msg-1"], undefined);
}, 200);

measure("structural edge projection (29 edges)", () => {
  documentToFlowEdges(structuralDocumentNodes, document.edges);
}, 200);

const configEditLatencies: number[] = [];
let seedNoOps = 0;
for (let keystroke = 0; keystroke < 20; keystroke += 1) {
  const start = performance.now();
  history = historyReducer(history, {
    type: "UPDATE_NODE_CONFIG",
    nodeId: "msg-1",
    patch: { message: `Updated ${keystroke}` },
    batch: true,
  });
  const slice = toStructuralNodes(history.present.document);
  const flowNodes = documentToFlowNodes(slice, ["msg-1"], undefined);
  const structuralSig = documentProjectionSignature(flowNodes);
  assert.equal(structuralSig, baselineStructuralSig, "structural signature stable across config edits");
  assert.equal(canvasStructuralNodeSignature(slice, ["msg-1"]), baselineStructuralNodeSig);
  assert.equal(canvasStructuralEdgeSignature(slice, history.present.document.edges), baselineStructuralEdgeSig);
  const seeded = seedControlledNodesFromDocument(baselineProjection as never, flowNodes as never);
  if (seeded === baselineProjection) seedNoOps += 1;
  configEditLatencies.push(performance.now() - start);
}

assert.equal(history.past.length, 0, "batched config edits do not create undo entries per keystroke");

const avgTypingLatency =
  configEditLatencies.reduce((sum, value) => sum + value, 0) / configEditLatencies.length;
console.log(`  avg typing pipeline latency: ${avgTypingLatency.toFixed(3)} ms (${configEditLatencies.length} keystrokes)`);

measure("structural validation only (30 nodes)", () => {
  validateWorkflowStructure(document);
}, 50);

measure("config validation only (30 nodes)", () => {
  validateWorkflowNodeConfigs(document);
}, 50);

const presentationSigBefore = documentPresentationSignature(document.nodes, nodeText);
const validationSigBefore = documentValidationSignature([], null);

history = historyReducer(history, {
  type: "UPDATE_NODE_CONFIG",
  nodeId: "msg-1",
  patch: { message: "Presentation-only change" },
  batch: true,
});
const presentationSigAfter = documentPresentationSignature(history.present.document.nodes, nodeText);
const sliceAfterConfig = toStructuralNodes(history.present.document);
assert.notEqual(presentationSigBefore, presentationSigAfter);
assert.equal(canvasStructuralNodeSignature(sliceAfterConfig, ["msg-1"]), baselineStructuralNodeSig);
assert.equal(documentTopologySignature(history.present.document), topologySig);

const validationIssues: ValidationIssue[] = [
  {
    id: "issue-1",
    message: "Missing end",
    severity: "error",
    nodeId: "msg-1",
    affectedNodeIds: ["msg-1"],
    affectedEdgeIds: ["edge-1"],
  },
];
const validationSigAfter = documentValidationSignature(validationIssues, "issue-1");
assert.notEqual(validationSigBefore, validationSigAfter);
assert.equal(canvasStructuralNodeSignature(sliceAfterConfig, ["msg-1"]), baselineStructuralNodeSig);

const localeAltNodeText = (_id: string, _field: "displayName" | "description", fallback: string) => `L:${fallback}`;
const localeSig = documentPresentationSignature(document.nodes, localeAltNodeText);
assert.notEqual(localeSig, documentPresentationSignature(document.nodes, nodeText));
assert.equal(canvasStructuralNodeSignature(structuralDocumentNodes, ["msg-1"]), baselineStructuralNodeSig);

assert.equal(getSwitchBranchColor("case-a"), getSwitchBranchColor("case-a"));
assert.notEqual(getSwitchBranchColor("case-a"), getSwitchBranchColor("case-b"));

console.log("\nBenchmark summary (P4.2 — 30-node workflow)");
console.log(`  structural signature stable on config edits: yes`);
console.log(`  structural signature stable on validation changes: yes`);
console.log(`  structural signature stable on locale changes: yes`);
console.log(`  presentation signature updates on config edits: yes`);
console.log(`  validation signature updates on validation changes: yes`);
console.log(`  canvas seed no-ops during typing (of 20 keystrokes): ${seedNoOps}/20`);
console.log(`  undo history entries after 20 batched keystrokes: ${history.past.length}`);
console.log(`  avg typing pipeline latency: ${avgTypingLatency.toFixed(3)} ms`);
console.log("\nWorkflow Builder render perf benchmark passed.\n");
