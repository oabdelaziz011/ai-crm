import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeExecutionBatches, graphProgress } from "./task-graph.js";
import { AgentPlanner, buildParallelExampleGraph } from "../planner/agent-planner.js";

describe("AgentPlanner", () => {
  it("plans create customer workflow", () => {
    const planner = new AgentPlanner();
    const graph = planner.plan({ workflowId: "wf-1", goal: "Create a new customer named Ahmed" });
    assert.ok(graph.nodes.length >= 3);
    assert.equal(graph.nodes.some((n) => n.tool === "create_customer"), true);
  });
});

describe("TaskGraph parallel batches", () => {
  it("runs B and C in same batch after A", () => {
    const graph = buildParallelExampleGraph("wf-2", "parallel lookup");
    const batches = computeExecutionBatches(graph);
    assert.equal(batches.length, 3);
    assert.deepEqual(batches[0].map((n) => n.id), ["A"]);
    assert.deepEqual(new Set(batches[1].map((n) => n.id)), new Set(["B", "C"]));
    assert.deepEqual(batches[2].map((n) => n.id), ["D"]);
  });

  it("reports progress", () => {
    const graph = buildParallelExampleGraph("wf-3", "test");
    graph.nodes[0].status = "verified";
    assert.equal(graphProgress(graph), 25);
  });
});
