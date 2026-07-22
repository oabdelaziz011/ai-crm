/**
 * Interaction node persistence regression tests.
 * Run: pnpm --dir artifacts/login-app test:workflow-builder-interaction-nodes
 */
import assert from "node:assert/strict";
import type {
  AutomationEdgeRecord,
  AutomationFlowRecord,
  AutomationNodeRecord,
} from "@workspace/automation-platform";
import { registerBuiltInWorkflowNodes } from "../src/workflow-builder/core/register-built-in-nodes";
import { getWorkflowNodeDefinition } from "../src/workflow-builder/core/node-registry";
import {
  createDefaultAskQuestionConfig,
  normalizeAskQuestionNodeConfig,
} from "../src/workflow-builder/core/conversation/ask-question-config";
import {
  createDefaultWaitForReplyConfig,
  normalizeWaitForReplyNodeConfig,
} from "../src/workflow-builder/core/conversation/wait-for-reply-config";
import {
  createBuilderNode,
  createDefaultDocument,
  mapDocumentToPersistence,
  mapFlowToDocument,
} from "../src/workflow-builder/core/persistence/workflow-mapper";
import { createEdgeFromNodes } from "../src/workflow-builder/core/state/builder-reducer";
import {
  hasBlockingValidationIssues,
  validateWorkflow,
} from "../src/workflow-builder/core/validation/workflow-validator";

registerBuiltInWorkflowNodes();

console.log("\nWorkflow builder interaction node tests\n");

const askDefinition = getWorkflowNodeDefinition("ask_question");
const waitDefinition = getWorkflowNodeDefinition("wait_for_reply");

const engineAskConfig = {
  builderType: "ask_question",
  action: "wait_for_input",
  prompt: "What is your phone number?",
  inputKey: "phone_number",
};

const normalizedAsk = normalizeAskQuestionNodeConfig(engineAskConfig);
assert.equal(normalizedAsk.question, "What is your phone number?");
assert.equal(normalizedAsk.saveAs, "phone_number");
assert.equal("prompt" in normalizedAsk, false);
assert.equal("inputKey" in normalizedAsk, false);
console.log("  ✓ ask_question normalizer maps prompt/inputKey to question/saveAs");

const engineWaitConfig = {
  builderType: "wait_for_reply",
  action: "wait_for_reply",
  prompt: "Tell us more",
  inputKey: "follow_up_reply",
};

const normalizedWait = normalizeWaitForReplyNodeConfig(engineWaitConfig);
assert.equal(normalizedWait.prompt, "Tell us more");
assert.equal(normalizedWait.saveAs, "follow_up_reply");
assert.equal("inputKey" in normalizedWait, false);
console.log("  ✓ wait_for_reply normalizer maps inputKey to saveAs");

const start = createBuilderNode("start", { x: 0, y: 0 }, "start-1");
const ask = createBuilderNode("ask_question", { x: 0, y: 120 }, "ask-1");
const wait = createBuilderNode("wait_for_reply", { x: 0, y: 240 }, "wait-1");
const end = createBuilderNode("end", { x: 0, y: 360 }, "end-1");

ask.config = {
  ...createDefaultAskQuestionConfig(),
  question: "What is your phone number?",
  saveAs: "phone_number",
};
wait.config = {
  ...createDefaultWaitForReplyConfig(),
  saveAs: "follow_up_reply",
  prompt: "Tell us more",
};

const document = {
  ...createDefaultDocument({ flowId: "flow-interaction", companyId: "company-1", name: "Interaction flow" }),
  nodes: [start, ask, wait, end],
  edges: [
    createEdgeFromNodes("start-1", "ask-1"),
    createEdgeFromNodes("ask-1", "wait-1"),
    createEdgeFromNodes("wait-1", "end-1"),
  ],
};

const persisted = mapDocumentToPersistence(document);
const askPersisted = persisted.nodes.find((node) => node.config.builderType === "ask_question");
const waitPersisted = persisted.nodes.find((node) => node.config.builderType === "wait_for_reply");

assert.deepEqual(askPersisted?.config, askDefinition.toEngineConfig(ask.config));
assert.deepEqual(waitPersisted?.config, waitDefinition.toEngineConfig(wait.config));
assert.equal(askPersisted?.config.prompt, "What is your phone number?");
assert.equal(askPersisted?.config.inputKey, "phone_number");
assert.equal(waitPersisted?.config.inputKey, "follow_up_reply");
console.log("  ✓ save serializes interaction nodes to engine field names");

const flow: AutomationFlowRecord = {
  id: "flow-interaction",
  company_id: "company-1",
  name: "Interaction flow",
  description: "",
  trigger_type: "inbound_message",
  status: "draft",
  version: 1,
  metadata: {},
  active_version_id: null,
  has_unpublished_draft: true,
  created_by: null,
  updated_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  deleted_at: null,
  deleted_by: null,
};

const dbNodes: AutomationNodeRecord[] = persisted.nodes.map((node, index) => ({
  id: document.nodes[index]!.id,
  flow_id: "flow-interaction",
  type: node.type,
  config: node.config as Record<string, unknown>,
  position_x: node.positionX,
  position_y: node.positionY,
  created_at: new Date().toISOString(),
}));

const dbEdges: AutomationEdgeRecord[] = persisted.edges.map((edge, index) => ({
  id: document.edges[index]!.id,
  flow_id: "flow-interaction",
  source_node_id: edge.sourceNodeId,
  target_node_id: edge.targetNodeId,
  condition: edge.condition ?? {},
  created_at: new Date().toISOString(),
}));

const reloaded = mapFlowToDocument(flow, dbNodes, dbEdges);
const reloadedAsk = reloaded.nodes.find((node) => node.id === "ask-1");
const reloadedWait = reloaded.nodes.find((node) => node.id === "wait-1");

assert.equal(reloadedAsk?.config.question, "What is your phone number?");
assert.equal(reloadedAsk?.config.saveAs, "phone_number");
assert.equal("prompt" in (reloadedAsk?.config ?? {}), false);
assert.equal("inputKey" in (reloadedAsk?.config ?? {}), false);
assert.equal(reloadedWait?.config.saveAs, "follow_up_reply");
assert.equal(reloadedWait?.config.prompt, "Tell us more");
assert.equal("inputKey" in (reloadedWait?.config ?? {}), false);
console.log("  ✓ reload restores builder field names only");

const askIssues = validateWorkflow(reloaded).filter((issue) => issue.nodeId === "ask-1");
const waitIssues = validateWorkflow(reloaded).filter((issue) => issue.nodeId === "wait-1");
assert.equal(askIssues.some((issue) => issue.id.endsWith("-question-required")), false);
assert.equal(askIssues.some((issue) => issue.id.endsWith("-saveAs-required")), false);
assert.equal(waitIssues.some((issue) => issue.id.endsWith("-saveAs-required")), false);
assert.equal(hasBlockingValidationIssues(validateWorkflow(reloaded)), false);
console.log("  ✓ save → reload → validate passes without re-editing nodes");

const restoredFromLegacyDb = askDefinition.fromEngineConfig("action", engineAskConfig);
assert.deepEqual(restoredFromLegacyDb, {
  question: "What is your phone number?",
  saveAs: "phone_number",
  required: true,
  placeholder: "Type your name",
  validationMessage: "Please enter your name to continue.",
});
console.log("  ✓ legacy engine-shaped ask_question configs deserialize cleanly");

console.log("\nAll workflow builder interaction node tests passed.\n");
