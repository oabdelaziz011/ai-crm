import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  requiresConfirmationForTool,
  requiresConfirmationPolicy,
  resolveToolConfirmationPolicy,
} from "./confirmation-policy.js";

describe("confirmation-policy", () => {
  it("never requires confirmation for read-only tools", () => {
    assert.equal(requiresConfirmationForTool("search_customer"), false);
    assert.equal(requiresConfirmationForTool("find_duplicate_customers"), false);
  });

  it("requires confirmation for destructive and bulk tools", () => {
    assert.equal(requiresConfirmationForTool("merge_customers"), true);
    assert.equal(requiresConfirmationForTool("import_customers"), true);
  });

  it("requires confirmation for external and financial tools", () => {
    assert.equal(requiresConfirmationForTool("create_booking"), true);
    assert.equal(requiresConfirmationForTool("refund_payment"), true);
  });

  it("maps policies to confirmation requirement", () => {
    assert.equal(requiresConfirmationPolicy("never"), false);
    assert.equal(requiresConfirmationPolicy("destructive"), true);
    assert.equal(requiresConfirmationPolicy("external"), true);
    assert.equal(requiresConfirmationPolicy("financial"), true);
    assert.equal(requiresConfirmationPolicy("bulk"), true);
    assert.equal(requiresConfirmationPolicy("always"), true);
  });

  it("declares irreversible destructive tools", () => {
    const merge = resolveToolConfirmationPolicy("merge_customers");
    assert.equal(merge.policy, "destructive");
    assert.equal(merge.irreversible, true);
  });

  it("bypasses bulk confirmation for single-row imports", () => {
    assert.equal(requiresConfirmationForTool("import_customers", { rows: [{ name: "A" }] }), false);
  });
});
