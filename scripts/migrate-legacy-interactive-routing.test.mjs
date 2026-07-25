/**
 * Unit tests for standalone legacy interactive routing migration.
 * Run: node scripts/migrate-legacy-interactive-routing.test.mjs
 */
import assert from "node:assert/strict";
import {
  migrateLegacyInteractiveRouting,
  isLegacyParallelIfGraph,
  isInteractiveNode,
  readInteractiveOptions,
} from "./lib/migrate-legacy-interactive-routing-core.mjs";

const flowId = "flow-1";
const buttons = {
  id: "buttons-1",
  flow_id: flowId,
  type: "action",
  config: {
    builderType: "buttons",
    action: "send_buttons",
    message: "Choose",
    buttons: [
      { id: "book", label: "Book Appointment" },
      { id: "pricing", label: "Pricing" },
    ],
  },
  position_x: 100,
  position_y: 100,
};
const bookIf = {
  id: "if-book",
  flow_id: flowId,
  type: "condition",
  config: {
    builderType: "if_else",
    ruleSet: {
      root: {
        id: "root",
        combinator: "and",
        rules: [{ id: "r1", field: "conversation.last_button_id", operator: "equals", value: "book" }],
      },
    },
  },
  position_x: 400,
  position_y: 80,
};
const pricingIf = {
  id: "if-pricing",
  flow_id: flowId,
  type: "condition",
  config: {
    builderType: "if_else",
    ruleSet: {
      root: {
        id: "root",
        combinator: "and",
        rules: [{ id: "r1", field: "conversation.last_button_title", operator: "equals", value: "Pricing" }],
      },
    },
  },
  position_x: 400,
  position_y: 140,
};
const booking = {
  id: "booking-msg",
  flow_id: flowId,
  type: "action",
  config: { action: "send_message", message: "What is your phone number?" },
  position_x: 700,
  position_y: 80,
};
const pricing = {
  id: "pricing-msg",
  flow_id: flowId,
  type: "action",
  config: { action: "send_message", message: "Pricing starts at $200." },
  position_x: 700,
  position_y: 140,
};

const nodes = [buttons, bookIf, pricingIf, booking, pricing];
const edges = [
  { id: "e1", flow_id: flowId, source_node_id: "buttons-1", target_node_id: "if-pricing", condition: {} },
  { id: "e2", flow_id: flowId, source_node_id: "buttons-1", target_node_id: "if-book", condition: {} },
  { id: "e3", flow_id: flowId, source_node_id: "if-book", target_node_id: "booking-msg", condition: { branch: "yes" } },
  {
    id: "e4",
    flow_id: flowId,
    source_node_id: "if-pricing",
    target_node_id: "pricing-msg",
    condition: { branch: "yes" },
  },
];

assert.equal(isInteractiveNode(buttons), true);
assert.deepEqual(readInteractiveOptions(buttons).map((item) => item.id), ["book", "pricing"]);
assert.equal(isLegacyParallelIfGraph(nodes, edges, "buttons-1"), true);

const migrated = migrateLegacyInteractiveRouting(nodes, edges);
assert.deepEqual(migrated.migratedNodeIds, ["buttons-1"]);

const switchNode = migrated.nodes.find((node) => node.config?.mode === "switch");
assert.ok(switchNode, "expected switch node");
assert.equal(switchNode.config.field, "conversation.last_button_id");
assert.equal(
  migrated.edges.some(
    (edge) =>
      edge.source_node_id === switchNode.id && edge.condition?.case === "book" && edge.target_node_id === "booking-msg",
  ),
  true,
);
assert.equal(
  migrated.edges.some(
    (edge) =>
      edge.source_node_id === switchNode.id &&
      edge.condition?.case === "pricing" &&
      edge.target_node_id === "pricing-msg",
  ),
  true,
);
assert.equal(migrated.edges.some((edge) => edge.source_node_id === "buttons-1" && edge.target_node_id === switchNode.id), true);
assert.equal(migrated.edges.some((edge) => edge.source_node_id === "buttons-1" && edge.target_node_id === "if-book"), false);

console.log("migrate-legacy-interactive-routing.test.mjs passed");
