import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AutomationEdgeRecord, AutomationNodeRecord } from "../types.js";
import { loadFlowGraph, resolveNextNodeId } from "./flow-graph.js";

describe("flow-graph", () => {
  it("finds trigger node as start and resolves condition branches", () => {
    const nodes: AutomationNodeRecord[] = [
      {
        id: "n1",
        flow_id: "f1",
        type: "trigger",
        config: {},
        position_x: 0,
        position_y: 0,
        created_at: new Date().toISOString(),
      },
      {
        id: "n2",
        flow_id: "f1",
        type: "condition",
        config: { variable: "tier", equals: "pro" },
        position_x: 0,
        position_y: 0,
        created_at: new Date().toISOString(),
      },
      {
        id: "n3",
        flow_id: "f1",
        type: "end",
        config: {},
        position_x: 0,
        position_y: 0,
        created_at: new Date().toISOString(),
      },
      {
        id: "n4",
        flow_id: "f1",
        type: "end",
        config: {},
        position_x: 0,
        position_y: 0,
        created_at: new Date().toISOString(),
      },
    ];
    const edges: AutomationEdgeRecord[] = [
      {
        id: "e1",
        flow_id: "f1",
        source_node_id: "n1",
        target_node_id: "n2",
        condition: {},
        created_at: new Date().toISOString(),
      },
      {
        id: "e2",
        flow_id: "f1",
        source_node_id: "n2",
        target_node_id: "n3",
        condition: { branch: "yes" },
        created_at: new Date().toISOString(),
      },
      {
        id: "e3",
        flow_id: "f1",
        source_node_id: "n2",
        target_node_id: "n4",
        condition: { branch: "no" },
        created_at: new Date().toISOString(),
      },
    ];

    const graph = loadFlowGraph(nodes, edges);
    assert.equal(graph.startNode.id, "n1");
    assert.equal(resolveNextNodeId(nodes[1]!, graph, { __branch: "yes" }), "n3");
    assert.equal(resolveNextNodeId(nodes[1]!, graph, { __branch: "no" }), "n4");
  });

  it("resolves switch case branches", () => {
    const nodes: AutomationNodeRecord[] = [
      {
        id: "s1",
        flow_id: "f1",
        type: "condition",
        config: { mode: "switch", field: "department", cases: [{ id: "sales", label: "Sales", value: "sales" }] },
        position_x: 0,
        position_y: 0,
        created_at: new Date().toISOString(),
      },
      {
        id: "s2",
        flow_id: "f1",
        type: "end",
        config: {},
        position_x: 0,
        position_y: 0,
        created_at: new Date().toISOString(),
      },
      {
        id: "s3",
        flow_id: "f1",
        type: "end",
        config: {},
        position_x: 0,
        position_y: 0,
        created_at: new Date().toISOString(),
      },
    ];
    const edges: AutomationEdgeRecord[] = [
      {
        id: "e1",
        flow_id: "f1",
        source_node_id: "s1",
        target_node_id: "s2",
        condition: { case: "sales" },
        created_at: new Date().toISOString(),
      },
      {
        id: "e2",
        flow_id: "f1",
        source_node_id: "s1",
        target_node_id: "s3",
        condition: { case: "default" },
        created_at: new Date().toISOString(),
      },
    ];
    const graph = loadFlowGraph(nodes, edges);
    assert.equal(resolveNextNodeId(nodes[0]!, graph, { __switchCase: "sales" }), "s2");
    assert.equal(resolveNextNodeId(nodes[0]!, graph, { __switchCase: "default" }), "s3");
  });
});
