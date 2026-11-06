import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseIncludedBranchIds, recordMatchesIncludedBranchIds } from "./included-branch-ids.ts";

describe("included branch ids", () => {
  it("offers every branch when the author has not chosen a subset", () => {
    assert.equal(parseIncludedBranchIds(undefined), null);
    assert.equal(parseIncludedBranchIds(""), null);
    assert.equal(parseIncludedBranchIds("{{selected_branch.id}}"), null);
    assert.equal(recordMatchesIncludedBranchIds("branch-a", ""), true);
  });

  it("keeps only the branches the author included", () => {
    const allowed = parseIncludedBranchIds("branch-a, branch-b");
    assert.deepEqual([...(allowed ?? [])].sort(), ["branch-a", "branch-b"]);
    assert.equal(recordMatchesIncludedBranchIds("branch-a", "branch-a, branch-b"), true);
    assert.equal(recordMatchesIncludedBranchIds("branch-c", ["branch-a", "branch-b"]), false);
  });
});
