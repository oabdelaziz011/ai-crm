import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveDefaultOpportunityNameFromLead } from "./opportunity-name-utils.js";

describe("resolveDefaultOpportunityNameFromLead", () => {
  it("builds deal title from company and lead title", () => {
    assert.equal(
      resolveDefaultOpportunityNameFromLead({ title: "Enterprise rollout", companyName: "Acme" }),
      "Acme — Enterprise rollout",
    );
  });

  it("never uses contact name — only deal title", () => {
    assert.equal(resolveDefaultOpportunityNameFromLead({ title: "Q4 renewal" }), "Q4 renewal");
  });
});
