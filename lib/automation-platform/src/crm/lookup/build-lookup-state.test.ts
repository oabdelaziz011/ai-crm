import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildLookupState, buildLookupStateFromStatus } from "./build-lookup-state.js";

describe("buildLookupState", () => {
  it("maps count to canonical lookup state", () => {
    assert.deepEqual(buildLookupState(0), { status: "not_found", count: 0 });
    assert.deepEqual(buildLookupState(1), { status: "found", count: 1 });
    assert.deepEqual(buildLookupState(2), { status: "duplicate", count: 2 });
  });
});

describe("buildLookupStateFromStatus", () => {
  it("uses service status as the source of truth", () => {
    assert.deepEqual(buildLookupStateFromStatus("duplicate", 1), {
      status: "duplicate",
      count: 1,
    });
    assert.deepEqual(buildLookupStateFromStatus("found", 1), {
      status: "found",
      count: 1,
    });
    assert.deepEqual(buildLookupStateFromStatus("not_found", 0), {
      status: "not_found",
      count: 0,
    });
  });
});
