import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EMPTY_KANBAN_FILTERS } from "./types.ts";

describe("enterprise kanban foundation", () => {
  it("exposes empty filter defaults", () => {
    assert.equal(EMPTY_KANBAN_FILTERS.search, "");
    assert.equal(EMPTY_KANBAN_FILTERS.ownerId, null);
    assert.equal(EMPTY_KANBAN_FILTERS.scoreBand, null);
    assert.equal(EMPTY_KANBAN_FILTERS.stageId, null);
  });

  it("keeps filter shape stable for reusable boards", () => {
    const keys = Object.keys(EMPTY_KANBAN_FILTERS).sort();
    assert.deepEqual(keys, [
      "city",
      "country",
      "createdFrom",
      "createdTo",
      "lastActivityFrom",
      "lastActivityTo",
      "ownerId",
      "scoreBand",
      "search",
      "sourceId",
      "stageId",
      "tag",
      "valueMax",
      "valueMin",
    ]);
  });
});
