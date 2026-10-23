import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { serviceIdsForBranch } from "./website-branch-services.ts";

describe("serviceIdsForBranch", () => {
  const offers = [
    { branchId: "cairo", serviceId: "clinic", resourceId: "adam" },
    { branchId: "giza", serviceId: "clinic", resourceId: "sara" },
    { branchId: "giza", serviceId: "dental", resourceId: "sara" },
  ];

  it("returns only the services offered at the selected branch", () => {
    assert.deepEqual([...serviceIdsForBranch(offers, "cairo")], ["clinic"]);
    assert.deepEqual([...serviceIdsForBranch(offers, "giza")].sort(), ["clinic", "dental"]);
  });

  it("returns nothing for a branch with no linked resource", () => {
    assert.equal(serviceIdsForBranch(offers, "alex").size, 0);
  });
});
