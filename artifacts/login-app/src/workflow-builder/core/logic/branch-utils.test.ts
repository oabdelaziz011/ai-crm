import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assignBranchForNewEdge,
  buildSwitchBranchPorts,
  normalizeSwitchEdgesForDocument,
  resolveBranchForConnection,
  switchCaseBranchKey,
  syncSwitchOutgoingEdges,
} from "./branch-utils.js";
import type { BuilderEdge, BuilderNode } from "../types.js";

function createEdgeId(source: string, target: string, branchKey?: string): string {
  return branchKey ? `${source}->${target}:${branchKey}` : `${source}->${target}`;
}

describe("switch branch wiring", () => {
  it("assigns outgoing edges in case value order", () => {
    const switchNode: BuilderNode = {
      id: "sw1",
      type: "switch",
      position: { x: 0, y: 0 },
      config: {
        field: "decision_result.value.label",
        cases: [
          { id: "uuid-1", label: "Booking", value: "booking" },
          { id: "uuid-2", label: "Pricing", value: "pricing" },
          { id: "uuid-3", label: "Support", value: "support" },
        ],
        includeDefault: true,
      },
    };

    const edges: BuilderEdge[] = [];
    const first = assignBranchForNewEdge(switchNode, edges);
    assert.equal(first.branchKey, "booking");
    edges.push({ id: "e1", source: "sw1", target: "t1", ...first });

    const second = assignBranchForNewEdge(switchNode, edges);
    assert.equal(second.branchKey, "pricing");
    edges.push({ id: "e2", source: "sw1", target: "t2", ...second });

    const third = assignBranchForNewEdge(switchNode, edges);
    assert.equal(third.branchKey, "support");
    edges.push({ id: "e3", source: "sw1", target: "t3", ...third });

    const fourth = assignBranchForNewEdge(switchNode, edges);
    assert.equal(fourth.branchKey, "default");
  });

  it("uses case value as the branch key", () => {
    assert.equal(switchCaseBranchKey({ id: "uuid", label: "Booking", value: "booking" }), "booking");
    assert.equal(switchCaseBranchKey({ id: "legacy-only", label: "X", value: "" }), "legacy-only");
  });

  it("migrates legacy id-keyed edges to value keys", () => {
    const cases = [
      { id: "uuid-1", label: "Booking", value: "booking" },
      { id: "uuid-2", label: "Pricing", value: "pricing" },
    ];
    const edges: BuilderEdge[] = [
      { id: "sw1->t1", source: "sw1", target: "t1", branchKey: "uuid-1", branchLabel: "Booking" },
      { id: "sw1->t2", source: "sw1", target: "t2", branchKey: "uuid-2", branchLabel: "Pricing" },
    ];

    const next = normalizeSwitchEdgesForDocument(
      [
        {
          id: "sw1",
          type: "switch",
          position: { x: 0, y: 0 },
          config: { field: "x", cases, includeDefault: true },
        },
      ],
      edges,
      createEdgeId,
    );

    assert.equal(next[0]?.branchKey, "booking");
    assert.equal(next[0]?.id, "sw1->t1:booking");
    assert.equal(next[1]?.branchKey, "pricing");
  });

  it("remaps edges when a case value is renamed", () => {
    const previous = [{ id: "uuid-1", label: "Booking", value: "book" }];
    const nextCases = [{ id: "uuid-1", label: "Booking", value: "booking" }];
    const edges: BuilderEdge[] = [
      { id: "sw1->t1:book", source: "sw1", target: "t1", branchKey: "book", branchLabel: "Booking" },
    ];

    const next = syncSwitchOutgoingEdges("sw1", previous, nextCases, edges, createEdgeId);
    assert.equal(next[0]?.branchKey, "booking");
    assert.equal(next[0]?.id, "sw1->t1:booking");
  });

  it("resolves an explicit case handle to that value", () => {
    const switchNode: BuilderNode = {
      id: "sw1",
      type: "switch",
      position: { x: 0, y: 0 },
      config: {
        field: "decision_result.value.label",
        cases: [
          { id: "uuid-1", label: "Booking", value: "booking" },
          { id: "uuid-2", label: "Support", value: "support" },
        ],
        includeDefault: true,
      },
    };

    const branch = resolveBranchForConnection(switchNode, [], "support");
    assert.equal(branch.branchKey, "support");
    assert.equal(branch.branchLabel, "Support");

    const ports = buildSwitchBranchPorts(switchNode.config);
    assert.deepEqual(
      ports.map((port) => port.key),
      ["booking", "support", "default"],
    );
  });
});
