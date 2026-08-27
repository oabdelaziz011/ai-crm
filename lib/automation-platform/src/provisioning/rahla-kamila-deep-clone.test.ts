import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RAHLA_KAMILA_ONE_TIME_CLONE_KEY,
  assertNoSharedIds,
  deepCloneJson,
  remapWorkflowSnapshotForCompanyClone,
  type WorkflowGraphSnapshotLike,
} from "./rahla-kamila-deep-clone.js";

describe("rahla-kamila deep clone remapping", () => {
  const source: WorkflowGraphSnapshotLike = {
    name: "رحلة كاملة",
    description: "source",
    triggerType: "inbound_message",
    metadata: {
      builderViewport: { x: 1, y: 2 },
      parent_flow_id: "SHOULD_BE_STRIPPED",
      source_flow_id: "SHOULD_BE_STRIPPED",
      template_key: "SHOULD_BE_STRIPPED",
    },
    nodes: [
      {
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        type: "trigger",
        config: { label: "start", nested: { a: 1 } },
        positionX: 0,
        positionY: 0,
      },
      {
        id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        type: "action",
        config: { label: "msg" },
        positionX: 100,
        positionY: 0,
      },
    ],
    edges: [
      {
        id: "edge-1",
        sourceNodeId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        targetNodeId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        condition: { branch: "yes" },
      },
    ],
  };

  it("assigns new ids and never reuses source ids", () => {
    let n = 0;
    const { snapshot, idMap } = remapWorkflowSnapshotForCompanyClone(source, {
      newId: () => `00000000-0000-0000-0000-00000000000${n++}`,
      clonedAt: "2026-01-01T00:00:00.000Z",
    });

    assert.equal(snapshot.nodes.length, 2);
    assert.equal(snapshot.edges.length, 1);
    assert.equal(Object.keys(idMap).length, 2);
    assertNoSharedIds(source, snapshot);
    assert.equal(snapshot.edges[0]?.sourceNodeId, idMap[source.nodes[0]!.id]);
    assert.equal(snapshot.edges[0]?.targetNodeId, idMap[source.nodes[1]!.id]);
  });

  it("deep-copies config so mutating clone does not mutate source", () => {
    let n = 0;
    const { snapshot } = remapWorkflowSnapshotForCompanyClone(source, {
      newId: () => `11111111-1111-1111-1111-11111111111${n++}`,
    });
    const cloneConfig = snapshot.nodes[0]!.config as { nested: { a: number } };
    cloneConfig.nested.a = 99;
    assert.equal((source.nodes[0]!.config as { nested: { a: number } }).nested.a, 1);
  });

  it("marks one_time_clone_key and strips parent/template linkage keys", () => {
    let n = 0;
    const { metadata } = remapWorkflowSnapshotForCompanyClone(source, {
      newId: () => `22222222-2222-2222-2222-22222222222${n++}`,
      clonedAt: "t0",
    });
    assert.equal(metadata.one_time_clone_key, RAHLA_KAMILA_ONE_TIME_CLONE_KEY);
    assert.equal(metadata.one_time_cloned_at, "t0");
    assert.equal(metadata.parent_flow_id, undefined);
    assert.equal(metadata.source_flow_id, undefined);
    assert.equal(metadata.template_key, undefined);
    assert.deepEqual(metadata.builderViewport, { x: 1, y: 2 });
  });

  it("deepCloneJson isolates nested objects", () => {
    const a = { x: { y: 1 } };
    const b = deepCloneJson(a);
    b.x.y = 2;
    assert.equal(a.x.y, 1);
  });
});
