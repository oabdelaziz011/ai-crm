import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateWorkflowSnapshot } from "./publish-validation.js";
import type { WorkflowGraphSnapshot } from "./types.js";

const baseSnapshot: WorkflowGraphSnapshot = {
  name: "Support journey",
  description: "",
  triggerType: "inbound_message",
  metadata: {},
  nodes: [
    { id: "start", type: "trigger", config: { builderType: "start" }, positionX: 0, positionY: 0 },
    { id: "menu", type: "action", config: { builderType: "buttons", action: "send_buttons", primaryMenu: true }, positionX: 0, positionY: 120 },
    { id: "support", type: "action", config: { builderType: "send_message", action: "send_message", message: "Call us" }, positionX: 0, positionY: 240 },
    { id: "return-menu", type: "action", config: { builderType: "return_to_main_menu", action: "return_to_main_menu" }, positionX: 0, positionY: 360 },
  ],
  edges: [
    { id: "e1", sourceNodeId: "start", targetNodeId: "menu", condition: {} },
    { id: "e2", sourceNodeId: "menu", targetNodeId: "support", condition: {} },
    { id: "e3", sourceNodeId: "support", targetNodeId: "return-menu", condition: {} },
  ],
};

describe("publish validation terminal nodes", () => {
  it("accepts workflows ending with End", () => {
    const snapshot: WorkflowGraphSnapshot = {
      ...baseSnapshot,
      nodes: [
        baseSnapshot.nodes[0]!,
        { id: "end", type: "end", config: { builderType: "end" }, positionX: 0, positionY: 120 },
      ],
      edges: [{ id: "e1", sourceNodeId: "start", targetNodeId: "end", condition: {} }],
    };

    const issues = validateWorkflowSnapshot(snapshot);
    assert.equal(issues.some((issue) => issue.id === "missing-end"), false);
  });

  it("accepts workflows ending with Return to Main Menu without End", () => {
    const issues = validateWorkflowSnapshot(baseSnapshot);
    assert.equal(issues.some((issue) => issue.id === "missing-end"), false);
    assert.equal(issues.some((issue) => issue.id === "missing-primary-menu"), false);
  });

  it("rejects workflows with no terminal node", () => {
    const snapshot: WorkflowGraphSnapshot = {
      ...baseSnapshot,
      nodes: [
        baseSnapshot.nodes[0]!,
        { id: "message", type: "action", config: { builderType: "send_message", action: "send_message" }, positionX: 0, positionY: 120 },
      ],
      edges: [{ id: "e1", sourceNodeId: "start", targetNodeId: "message", condition: {} }],
    };

    const issues = validateWorkflowSnapshot(snapshot);
    assert.ok(issues.some((issue) => issue.id === "missing-end"));
    assert.ok(issues.some((issue) => issue.id === "dead-end-message"));
  });

  it("rejects IF branches that never reach a terminal node", () => {
    const snapshot: WorkflowGraphSnapshot = {
      ...baseSnapshot,
      name: "Branching journey",
      nodes: [
        { id: "start", type: "trigger", config: { builderType: "start" }, positionX: 0, positionY: 0 },
        { id: "if", type: "condition", config: { builderType: "if_else" }, positionX: 0, positionY: 120 },
        { id: "end", type: "end", config: { builderType: "end" }, positionX: 0, positionY: 240 },
        { id: "message", type: "action", config: { builderType: "send_message", action: "send_message" }, positionX: 0, positionY: 240 },
      ],
      edges: [
        { id: "e1", sourceNodeId: "start", targetNodeId: "if", condition: {} },
        { id: "e2", sourceNodeId: "if", targetNodeId: "end", condition: { branch: "yes" } },
        { id: "e3", sourceNodeId: "if", targetNodeId: "message", condition: { branch: "no" } },
      ],
    };

    const issues = validateWorkflowSnapshot(snapshot);
    assert.ok(issues.some((issue) => issue.message.includes("Branch 'NO' ends without a terminal step.")));
  });
});
