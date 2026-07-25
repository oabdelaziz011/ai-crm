import assert from "node:assert/strict";
import { registerBuiltInWorkflowNodes } from "../src/workflow-builder/core/register-built-in-nodes";
import { validateWorkflow, hasBlockingValidationIssues } from "../src/workflow-builder/core/validation/workflow-validator";
import {
  generateInteractiveRouting,
  migrateLegacyInteractiveRouting,
} from "../src/workflow-builder/core/logic/interactive-routing-generator";
import { createBuilderNode } from "../src/workflow-builder/core/persistence/workflow-mapper";
import type { WorkflowDocument } from "../src/workflow-builder/core/types";

registerBuiltInWorkflowNodes();

function baseDocument(overrides?: Partial<WorkflowDocument>): WorkflowDocument {
  const start = createBuilderNode("start", { x: 0, y: 0 }, "start-1");
  const end = createBuilderNode("end", { x: 800, y: 0 }, "end-1");
  return {
    flowId: "flow-1",
    companyId: "company-1",
    name: "Interactive routing test",
    description: "",
    triggerType: "inbound_message",
    status: "draft",
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [start, end],
    edges: [{ id: "start-1->end-1", source: "start-1", target: "end-1" }],
    ...overrides,
  };
}

function createButtonsNode(id: string): ReturnType<typeof createBuilderNode> {
  const node = createBuilderNode("buttons", { x: 200, y: 0 }, id);
  node.config = {
    ...node.config,
    message: "Choose",
    buttons: [
      { id: "book", label: "Book Appointment" },
      { id: "pricing", label: "Pricing" },
      { id: "support", label: "Talk to Support" },
    ],
  };
  return node;
}

function createIfNode(id: string, selectionId: string): ReturnType<typeof createBuilderNode> {
  const node = createBuilderNode("if_else", { x: 500, y: 0 }, id);
  node.config = {
    ruleSet: {
      root: {
        id: "root",
        combinator: "and",
        rules: [{ id: "r1", field: "conversation.last_button_id", operator: "equals", value: selectionId }],
      },
    },
  };
  return node;
}

{
  const buttons = createButtonsNode("buttons-1");
  const pricingIf = createIfNode("if-pricing", "pricing");
  const bookIf = createIfNode("if-book", "book");
  const document = baseDocument({
    nodes: [...baseDocument().nodes, buttons, pricingIf, bookIf],
    edges: [
      { id: "start->buttons", source: "start-1", target: "buttons-1" },
      { id: "buttons->pricing-if", source: "buttons-1", target: "if-pricing" },
      { id: "buttons->book-if", source: "buttons-1", target: "if-book" },
    ],
  });

  const issues = validateWorkflow(document);
  assert.ok(
    issues.some((issue) => issue.id === "buttons-1-interactive-routing" && issue.severity === "error"),
    "expected publish-blocking interactive routing validation issue",
  );
  assert.equal(hasBlockingValidationIssues(issues), true);
  console.log("  ✓ invalid parallel interactive graph is rejected at validation");
}

{
  const buttons = createButtonsNode("buttons-1");
  const pricingIf = createIfNode("if-pricing", "pricing");
  pricingIf.config = {
    ruleSet: {
      root: {
        id: "root",
        combinator: "and",
        rules: [{ id: "r1", field: "conversation.last_button_title", operator: "equals", value: "Pricing" }],
      },
    },
  };
  const bookIf = createIfNode("if-book", "book");
  const supportIf = createIfNode("if-support", "support");
  const booking = createBuilderNode("send_message", { x: 900, y: -120 }, "booking-msg");
  booking.config = { ...booking.config, message: "What is your phone number?" };
  const pricing = createBuilderNode("send_message", { x: 900, y: 0 }, "pricing-msg");
  pricing.config = { ...pricing.config, message: "Pricing starts at $200." };
  const support = createBuilderNode("send_message", { x: 900, y: 120 }, "support-msg");
  support.config = { ...support.config, message: "For support please call :19666" };

  let document = baseDocument({
    nodes: [...baseDocument().nodes, buttons, pricingIf, bookIf, supportIf, booking, pricing, support],
    edges: [
      { id: "start->buttons", source: "start-1", target: "buttons-1" },
      { id: "buttons->pricing-if", source: "buttons-1", target: "if-pricing" },
      { id: "buttons->book-if", source: "buttons-1", target: "if-book" },
      { id: "buttons->support-if", source: "buttons-1", target: "if-support" },
      { id: "book-if-yes", source: "if-book", target: "booking-msg", branchKey: "yes", branchLabel: "YES" },
      { id: "pricing-if-yes", source: "if-pricing", target: "pricing-msg", branchKey: "yes", branchLabel: "YES" },
      { id: "support-if-yes", source: "if-support", target: "support-msg", branchKey: "yes", branchLabel: "YES" },
    ],
  });

  const migrated = migrateLegacyInteractiveRouting(document);
  assert.deepEqual(migrated.migratedNodeIds, ["buttons-1"]);

  const switchNode = migrated.document.nodes.find((node) => node.type === "switch");
  assert.ok(switchNode, "expected generated Switch node");
  assert.equal(switchNode.config.field, "conversation.last_button_id");
  assert.equal(migrated.document.edges.some((edge) => edge.source === "buttons-1" && edge.target === switchNode.id), true);
  assert.equal(
    migrated.document.edges.some(
      (edge) => edge.source === switchNode.id && edge.branchKey === "book" && edge.target === "booking-msg",
    ),
    true,
  );
  assert.equal(
    migrated.document.edges.some(
      (edge) => edge.source === switchNode.id && edge.branchKey === "pricing" && edge.target === "pricing-msg",
    ),
    true,
  );
  assert.equal(hasBlockingValidationIssues(validateWorkflow(document)), true);
  const migratedIssues = validateWorkflow(migrated.document);
  assert.equal(
    migratedIssues.some((issue) => issue.id === "buttons-1-interactive-routing"),
    false,
    "interactive routing error should be resolved after migration",
  );
  console.log("  ✓ legacy parallel If/Else graph migrates to Switch routing (CNV-000010 pattern)");
}

{
  const buttons = createButtonsNode("buttons-1");
  let document = baseDocument({
    nodes: [...baseDocument().nodes, buttons],
    edges: [{ id: "start->buttons", source: "start-1", target: "buttons-1" }],
  });

  const generated = generateInteractiveRouting(document, "buttons-1");
  assert.equal(generated.created, true);
  const switchNode = generated.document.nodes.find((node) => node.type === "switch");
  assert.ok(switchNode);
  const cases = switchNode!.config.cases as Array<{ id: string; value: string }>;
  assert.equal(cases.length, 3);
  assert.deepEqual(
    cases.map((item) => item.value),
    ["book", "pricing", "support"],
  );
  console.log("  ✓ Generate Routing inserts Switch(last_button_id) with synchronized case ids");
}

console.log("workflow-builder interactive routing tests passed");
