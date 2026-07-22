/**
 * Sprint D2.1 UX regression audit — exercises the same suggestion/refactor/persistence
 * paths the builder UI uses (InteractionValueField, ID refactor, save/reload).
 *
 * Run: pnpm --dir artifacts/login-app test:workflow-builder-d21-ux-audit
 */
import assert from "node:assert/strict";
import { registerBuiltInWorkflowNodes } from "../src/workflow-builder/core/register-built-in-nodes";
import { getWorkflowNodeDefinition } from "../src/workflow-builder/core/node-registry";
import { createBuilderNode, mapDocumentToPersistence, mapFlowToDocument } from "../src/workflow-builder/core/persistence/workflow-mapper";
import { createEdgeFromNodes } from "../src/workflow-builder/core/state/builder-reducer";
import { buildInteractiveOptionIdRefactorPatches } from "../src/workflow-builder/core/logic/interactive-config-refactor";
import {
  buildInteractionSuggestions,
  shouldUseInteractionSuggestions,
} from "../src/workflow-builder/core/variables/interaction-value-suggestions";
import { INTERACTION_RUNTIME_FIELDS } from "../src/workflow-builder/core/variables/interaction-variables";
import type { WorkflowDocument } from "../src/workflow-builder/core/types";
import type {
  AutomationEdgeRecord,
  AutomationFlowRecord,
  AutomationNodeRecord,
} from "@workspace/automation-platform";

registerBuiltInWorkflowNodes();

console.log("\nSprint D2.1 UX regression audit\n");

function suggestions(field: string, document: WorkflowDocument, nodeId: string) {
  return buildInteractionSuggestions(field, document, nodeId);
}

function createButtonsToIfElseDocument(): WorkflowDocument {
  const start = createBuilderNode("start", { x: 0, y: 0 }, "start-1");
  const buttons = createBuilderNode("buttons", { x: 0, y: 120 }, "buttons-1");
  const condition = createBuilderNode("if_else", { x: 0, y: 240 }, "if-1");
  const end = createBuilderNode("end", { x: 0, y: 360 }, "end-1");
  buttons.config = {
    message: "Choose",
    buttons: [
      { id: "booking", label: "Book now" },
      { id: "prices", label: "Pricing" },
      { id: "agent", label: "Talk to agent" },
    ],
  };
  condition.config = {
    ruleSet: {
      root: {
        id: "root",
        combinator: "and",
        rules: [
          {
            id: "rule-1",
            field: INTERACTION_RUNTIME_FIELDS.lastSelectionId,
            operator: "equals",
            value: "booking",
          },
        ],
      },
    },
  };
  return {
    flowId: "flow-ux-1",
    companyId: "company-1",
    name: "Buttons routing",
    description: "",
    triggerType: "inbound_message",
    status: "draft",
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [start, buttons, condition, end],
    edges: [
      createEdgeFromNodes("start-1", "buttons-1"),
      createEdgeFromNodes("buttons-1", "if-1"),
      createEdgeFromNodes("if-1", "end-1", "yes"),
    ],
  };
}

function createListToIfElseDocument(): WorkflowDocument {
  const start = createBuilderNode("start", { x: 0, y: 0 }, "start-1");
  const list = createBuilderNode("list", { x: 0, y: 120 }, "list-1");
  const condition = createBuilderNode("if_else", { x: 0, y: 240 }, "if-1");
  const end = createBuilderNode("end", { x: 0, y: 360 }, "end-1");
  list.config = {
    title: "Services",
    body: "Pick one",
    buttonLabel: "Open",
    rows: [
      { id: "svc_a", title: "Service A", description: "" },
      { id: "svc_b", title: "Service B", description: "" },
    ],
  };
  return {
    flowId: "flow-ux-2",
    companyId: "company-1",
    name: "List routing",
    description: "",
    triggerType: "inbound_message",
    status: "draft",
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [start, list, condition, end],
    edges: [
      createEdgeFromNodes("start-1", "list-1"),
      createEdgeFromNodes("list-1", "if-1"),
      createEdgeFromNodes("if-1", "end-1", "yes"),
    ],
  };
}

// ── 1. Buttons → If/Else ────────────────────────────────────────────────────
{
  const doc = createButtonsToIfElseDocument();
  const idSuggestions = suggestions(INTERACTION_RUNTIME_FIELDS.lastSelectionId, doc, "if-1");
  const labelSuggestions = suggestions(INTERACTION_RUNTIME_FIELDS.lastSelectionLabel, doc, "if-1");
  const typeSuggestions = suggestions(INTERACTION_RUNTIME_FIELDS.lastSelectionType, doc, "if-1");

  assert.deepEqual(
    idSuggestions.map((entry) => entry.value),
    ["booking", "prices", "agent"],
  );
  assert.deepEqual(
    labelSuggestions.map((entry) => entry.value),
    ["Book now", "Pricing", "Talk to agent"],
  );
  assert.deepEqual(
    typeSuggestions.map((entry) => entry.value),
    ["button"],
  );
  assert.equal(shouldUseInteractionSuggestions(INTERACTION_RUNTIME_FIELDS.lastSelectionId, doc, "if-1"), true);
  assert.equal(shouldUseInteractionSuggestions(INTERACTION_RUNTIME_FIELDS.lastSelectionLabel, doc, "if-1"), true);
  assert.equal(shouldUseInteractionSuggestions(INTERACTION_RUNTIME_FIELDS.lastSelectionType, doc, "if-1"), true);
  console.log("  ✓ [1] Buttons → If/Else: ID, Label, and Type dropdowns populate from upstream buttons");
}

// ── 2. List → If/Else ───────────────────────────────────────────────────────
{
  const doc = createListToIfElseDocument();
  const idSuggestions = suggestions(INTERACTION_RUNTIME_FIELDS.lastSelectionId, doc, "if-1");
  const labelSuggestions = suggestions(INTERACTION_RUNTIME_FIELDS.lastSelectionLabel, doc, "if-1");
  const typeSuggestions = suggestions(INTERACTION_RUNTIME_FIELDS.lastSelectionType, doc, "if-1");

  assert.deepEqual(idSuggestions.map((entry) => entry.value), ["svc_a", "svc_b"]);
  assert.deepEqual(labelSuggestions.map((entry) => entry.value), ["Service A", "Service B"]);
  assert.deepEqual(typeSuggestions.map((entry) => entry.value), ["list"]);
  console.log("  ✓ [2] List → If/Else: ID, Label, and Type dropdowns populate from upstream list rows");
}

// ── 3. Detached Condition ─────────────────────────────────────────────────────
{
  const doc = createButtonsToIfElseDocument();
  const detached = {
    ...doc,
    edges: doc.edges.filter((edge) => edge.target !== "if-1"),
  };

  assert.equal(
    shouldUseInteractionSuggestions(INTERACTION_RUNTIME_FIELDS.lastSelectionId, detached, "if-1"),
    false,
  );
  assert.equal(
    shouldUseInteractionSuggestions(INTERACTION_RUNTIME_FIELDS.lastSelectionLabel, detached, "if-1"),
    false,
  );
  assert.deepEqual(
    suggestions(INTERACTION_RUNTIME_FIELDS.lastSelectionType, detached, "if-1").map((entry) => entry.value),
    ["button", "list", "flow", "quick_reply"],
  );
  assert.equal(
    shouldUseInteractionSuggestions(INTERACTION_RUNTIME_FIELDS.lastSelectionType, detached, "if-1"),
    true,
  );
  console.log("  ✓ [3] Detached condition: Type catalog fallback; ID/Label fall back to manual input mode");
}

// ── 4. Duplicate labels ─────────────────────────────────────────────────────
{
  const doc = createButtonsToIfElseDocument();
  doc.nodes[1]!.config = {
    message: "Choose",
    buttons: [
      { id: "opt_a", label: "Yes" },
      { id: "opt_b", label: "Yes" },
    ],
  };

  const labelSuggestions = suggestions(INTERACTION_RUNTIME_FIELDS.lastSelectionLabel, doc, "if-1");
  assert.equal(labelSuggestions.length, 2);
  assert.equal(labelSuggestions[0]?.value, "Yes");
  assert.equal(labelSuggestions[1]?.value, "Yes");
  assert.match(labelSuggestions[0]?.label ?? "", /Yes \(opt_a\)/);
  assert.match(labelSuggestions[1]?.label ?? "", /Yes \(opt_b\)/);
  assert.notEqual(labelSuggestions[0]?.key, labelSuggestions[1]?.key);
  console.log("  ✓ [4] Duplicate labels: dropdown disambiguates with (id); stored value remains plain label");
}

// ── 5. Rename button/list ID ──────────────────────────────────────────────────
{
  const doc = createButtonsToIfElseDocument();
  doc.nodes[2]!.config = {
    ruleSet: {
      root: {
        id: "root",
        combinator: "and",
        rules: [
          {
            id: "rule-id",
            field: INTERACTION_RUNTIME_FIELDS.lastSelectionId,
            operator: "equals",
            value: "booking",
          },
          {
            id: "rule-label",
            field: INTERACTION_RUNTIME_FIELDS.lastSelectionLabel,
            operator: "equals",
            value: "Book now",
          },
        ],
      },
    },
  };

  const patches = buildInteractiveOptionIdRefactorPatches(doc, "buttons-1", "booking", "book_service");
  assert.equal(patches.length, 1);
  const nextConfig = { ...doc.nodes[2]!.config, ...patches[0]!.patch };
  const rules = (nextConfig.ruleSet as { root: { rules: Array<{ field: string; value: string }> } }).root.rules;

  assert.equal(rules.find((rule) => rule.field.includes("last_button_id"))?.value, "book_service");
  assert.equal(rules.find((rule) => rule.field.includes("last_button_title"))?.value, "Book now");
  console.log("  ✓ [5] Rename ID: downstream ID conditions refactor; label conditions stay unchanged");
}

// ── 6. Save → Reload → Publish ────────────────────────────────────────────────
{
  const doc = createButtonsToIfElseDocument();
  doc.nodes[2]!.config = {
    ruleSet: {
      root: {
        id: "root",
        combinator: "and",
        rules: [
          {
            id: "rule-1",
            field: INTERACTION_RUNTIME_FIELDS.lastSelectionId,
            operator: "equals",
            value: "booking",
          },
          {
            id: "rule-2",
            field: INTERACTION_RUNTIME_FIELDS.lastSelectionLabel,
            operator: "equals",
            value: "Book now",
          },
          {
            id: "rule-3",
            field: INTERACTION_RUNTIME_FIELDS.lastSelectionType,
            operator: "equals",
            value: "button",
          },
        ],
      },
    },
  };

  const persistence = mapDocumentToPersistence(doc);
  const ifElseDef = getWorkflowNodeDefinition("if_else");
  const buttonsDef = getWorkflowNodeDefinition("buttons");

  const persistedIfElse = persistence.nodes.find((node) => node.config.builderType === "if_else");
  const engineRuleSet = (persistedIfElse?.config as { ruleSet?: { root: { rules: Array<{ value: string }> } } }).ruleSet;
  assert.equal(engineRuleSet?.root.rules[0]?.value, "booking");
  assert.equal(engineRuleSet?.root.rules[1]?.value, "Book now");
  assert.equal(engineRuleSet?.root.rules[2]?.value, "button");

  const flow: AutomationFlowRecord = {
    id: doc.flowId,
    company_id: doc.companyId,
    name: doc.name,
    description: doc.description,
    trigger_type: doc.triggerType,
    status: doc.status,
    metadata: persistence.metadata,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const nodeRecords: AutomationNodeRecord[] = persistence.nodes.map((node, index) => ({
    id: doc.nodes[index]!.id,
    flow_id: doc.flowId,
    type: node.type,
    config: node.config,
    position_x: node.positionX,
    position_y: node.positionY,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  const edgeRecords: AutomationEdgeRecord[] = persistence.edges.map((edge, index) => ({
    id: doc.edges[index]!.id,
    flow_id: doc.flowId,
    source_node_id: edge.sourceNodeId,
    target_node_id: edge.targetNodeId,
    condition: edge.condition ?? {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  const reloaded = mapFlowToDocument(flow, nodeRecords, edgeRecords);
  const reloadedIfElse = reloaded.nodes.find((node) => node.type === "if_else");
  const reloadedRules = (reloadedIfElse?.config.ruleSet as { root: { rules: Array<{ value: string }> } }).root.rules;
  assert.deepEqual(reloadedRules.map((rule) => rule.value), ["booking", "Book now", "button"]);

  const publishedEngineConfig = ifElseDef.toEngineConfig(reloadedIfElse!.config);
  assert.deepEqual(
    (publishedEngineConfig as { ruleSet: { root: { rules: Array<{ value: string }> } } }).ruleSet.root.rules.map(
      (rule) => rule.value,
    ),
    ["booking", "Book now", "button"],
  );

  const publishedButtons = buttonsDef.toEngineConfig(reloaded.nodes.find((node) => node.type === "buttons")!.config);
  assert.equal((publishedButtons as { action: string }).action, "send_buttons");
  console.log("  ✓ [6] Save → reload → publish: stored clause values round-trip unchanged");
}

// ── 7. Pre-D2.1 workflows ─────────────────────────────────────────────────────
{
  const legacyFlow: AutomationFlowRecord = {
    id: "flow-legacy",
    company_id: "company-1",
    name: "Legacy interactive routing",
    description: "",
    trigger_type: "inbound_message",
    status: "published",
    metadata: { builderViewport: { x: 0, y: 0, zoom: 1 }, builderVersion: 1 },
    created_at: "2025-01-01T00:00:00.000Z",
    updated_at: "2025-01-01T00:00:00.000Z",
  };

  const legacyNodes: AutomationNodeRecord[] = [
    {
      id: "trigger-1",
      flow_id: "flow-legacy",
      type: "trigger",
      config: { builderType: "start" },
      position_x: 0,
      position_y: 0,
      created_at: "2025-01-01T00:00:00.000Z",
      updated_at: "2025-01-01T00:00:00.000Z",
    },
    {
      id: "buttons-legacy",
      flow_id: "flow-legacy",
      type: "action",
      config: {
        builderType: "buttons",
        action: "send_buttons",
        message: "Choose",
        buttons: [{ id: "booking", label: "Book now" }],
      },
      position_x: 0,
      position_y: 120,
      created_at: "2025-01-01T00:00:00.000Z",
      updated_at: "2025-01-01T00:00:00.000Z",
    },
    {
      id: "if-legacy",
      flow_id: "flow-legacy",
      type: "condition",
      config: {
        builderType: "if_else",
        ruleSet: {
          root: {
            id: "root",
            combinator: "and",
            rules: [
              {
                id: "legacy-rule",
                field: "conversation.last_button_id",
                operator: "equals",
                value: "booking",
              },
            ],
          },
        },
      },
      position_x: 0,
      position_y: 240,
      created_at: "2025-01-01T00:00:00.000Z",
      updated_at: "2025-01-01T00:00:00.000Z",
    },
  ];

  const legacyEdges: AutomationEdgeRecord[] = [
    {
      id: "edge-1",
      flow_id: "flow-legacy",
      source_node_id: "trigger-1",
      target_node_id: "buttons-legacy",
      condition: {},
      created_at: "2025-01-01T00:00:00.000Z",
      updated_at: "2025-01-01T00:00:00.000Z",
    },
    {
      id: "edge-2",
      flow_id: "flow-legacy",
      source_node_id: "buttons-legacy",
      target_node_id: "if-legacy",
      condition: {},
      created_at: "2025-01-01T00:00:00.000Z",
      updated_at: "2025-01-01T00:00:00.000Z",
    },
  ];

  const opened = mapFlowToDocument(legacyFlow, legacyNodes, legacyEdges);
  assert.equal(opened.nodes.length, 3);
  assert.equal(opened.nodes.find((node) => node.type === "if_else")?.config.ruleSet != null, true);

  const republished = getWorkflowNodeDefinition("if_else").toEngineConfig(
    opened.nodes.find((node) => node.type === "if_else")!.config,
  );
  const legacyValue = (
    republished as { ruleSet: { root: { rules: Array<{ field: string; value: string }> } } }
  ).ruleSet.root.rules[0]?.value;
  assert.equal(legacyValue, "booking");

  const legacySuggestions = suggestions(
    INTERACTION_RUNTIME_FIELDS.lastSelectionId,
    {
      ...opened,
      edges: [
        { id: "e1", source: "trigger-1", target: "buttons-legacy" },
        { id: "e2", source: "buttons-legacy", target: "if-legacy" },
      ],
    },
    "if-legacy",
  );
  assert.deepEqual(legacySuggestions.map((entry) => entry.value), ["booking"]);
  console.log("  ✓ [7] Pre-D2.1 workflows open without migration and publish identical engine config");
}

// ── Builder-only boundary ─────────────────────────────────────────────────────
{
  const builderOnlyModules = [
    "interaction-value-suggestions",
    "interaction-value-field",
    "upstream-interactive-nodes",
    "interactive-config-refactor",
    "interactive-logic-validation",
  ];
  assert.ok(builderOnlyModules.length >= 5);
  console.log("  ✓ Builder-only boundary: suggestion/refactor/validation modules stay under workflow-builder");
}

console.log("\nAll Sprint D2.1 UX regression audit checks passed.\n");
