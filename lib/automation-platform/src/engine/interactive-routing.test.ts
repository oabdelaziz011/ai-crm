import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AutomationGraphError } from "../errors.js";
import type { AutomationEdgeRecord, AutomationNodeRecord } from "../types.js";
import {
  isInteractiveActionNode,
  resolveInteractiveNextNode,
} from "./interactive-routing.js";

function node(partial: Partial<AutomationNodeRecord> & Pick<AutomationNodeRecord, "id" | "type">): AutomationNodeRecord {
  return {
    flow_id: "flow-1",
    config: {},
    position_x: 0,
    position_y: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...partial,
  };
}

function edge(
  source: string,
  target: string,
  condition: Record<string, unknown> = {},
  id?: string,
): AutomationEdgeRecord {
  return {
    id: id ?? `${source}->${target}`,
    flow_id: "flow-1",
    source_node_id: source,
    target_node_id: target,
    condition,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

const selectionVars = {
  conversation: {
    last_button_id: "book",
    last_button_title: "Book Appointment",
    last_selection_type: "button",
  },
  interactive_selection: "book",
};

describe("interactive-routing", () => {
  it("detects interactive action nodes", () => {
    assert.equal(
      isInteractiveActionNode(node({ id: "b1", type: "action", config: { action: "send_buttons" } })),
      true,
    );
    assert.equal(
      isInteractiveActionNode(node({ id: "l1", type: "action", config: { action: "send_list" } })),
      true,
    );
    assert.equal(isInteractiveActionNode(node({ id: "m1", type: "action", config: { action: "send_message" } })), false);
  });

  it("uses single outgoing edge for backwards compatibility", () => {
    const buttons = node({ id: "buttons", type: "action", config: { action: "send_buttons" } });
    const target = node({ id: "switch", type: "condition", config: { mode: "switch" } });
    const result = resolveInteractiveNextNode(buttons, {
      nodes: [buttons, target],
      edges: [edge("buttons", "switch")],
    }, selectionVars);
    assert.equal(result.nextNodeId, "switch");
    assert.match(result.selectionReason, /backwards compatible/i);
  });

  it("routes to Switch when multiple edges include one Switch router", () => {
    const buttons = node({ id: "buttons", type: "action", config: { action: "send_buttons" } });
    const switchNode = node({ id: "switch", type: "condition", config: { mode: "switch" } });
    const ifNode = node({ id: "if1", type: "condition", config: { ruleSet: { root: { id: "r", combinator: "and", rules: [] } } } });
    const result = resolveInteractiveNextNode(
      buttons,
      {
        nodes: [buttons, switchNode, ifNode],
        edges: [edge("buttons", "if1"), edge("buttons", "switch", {}, "e-switch")],
      },
      selectionVars,
    );
    assert.equal(result.nextNodeId, "switch");
  });

  it("matches selection-tagged edges using conversation.last_button_id", () => {
    const buttons = node({ id: "buttons", type: "action", config: { action: "send_buttons" } });
    const bookFlow = node({ id: "book-flow", type: "action", config: { action: "send_message" } });
    const pricingFlow = node({ id: "pricing-flow", type: "action", config: { action: "send_message" } });
    const result = resolveInteractiveNextNode(
      buttons,
      {
        nodes: [buttons, bookFlow, pricingFlow],
        edges: [
          edge("buttons", "pricing-flow", { selectionId: "pricing" }),
          edge("buttons", "book-flow", { selectionId: "book" }),
        ],
      },
      selectionVars,
    );
    assert.equal(result.nextNodeId, "book-flow");
  });

  it("uses default edge when selection does not match a tagged case", () => {
    const buttons = node({ id: "buttons", type: "action", config: { action: "send_buttons" } });
    const fallback = node({ id: "fallback", type: "action", config: { action: "send_message" } });
    const result = resolveInteractiveNextNode(
      buttons,
      {
        nodes: [buttons, fallback],
        edges: [
          edge("buttons", "fallback", { case: "default" }),
          edge("buttons", "missing", { selectionId: "pricing" }),
        ],
      },
      { conversation: { last_button_id: "unknown" } },
    );
    assert.equal(result.nextNodeId, "fallback");
  });

  it("fails instead of silently choosing outgoing[0] for parallel unconditional branches", () => {
    const buttons = node({ id: "buttons", type: "action", config: { action: "send_buttons" } });
    const ifA = node({ id: "if-a", type: "condition", config: {} });
    const ifB = node({ id: "if-b", type: "condition", config: {} });
    assert.throws(
      () =>
        resolveInteractiveNextNode(
          buttons,
          {
            nodes: [buttons, ifA, ifB],
            edges: [edge("buttons", "if-a"), edge("buttons", "if-b")],
          },
          selectionVars,
        ),
      AutomationGraphError,
    );
  });

  it("supports list selection ids the same way as button ids", () => {
    const list = node({ id: "list", type: "action", config: { action: "send_list" } });
    const doctor = node({ id: "doctor", type: "end", config: {} });
    const result = resolveInteractiveNextNode(
      list,
      {
        nodes: [list, doctor],
        edges: [edge("list", "doctor", { selectionId: "dr3" })],
      },
      {
        conversation: { last_button_id: "dr3", last_selection_type: "list" },
      },
    );
    assert.equal(result.nextNodeId, "doctor");
  });
});
