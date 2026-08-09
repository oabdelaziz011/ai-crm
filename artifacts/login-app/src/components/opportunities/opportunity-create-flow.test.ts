import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveOpportunityCreateFlowView } from "./opportunity-create-flow";

describe("resolveOpportunityCreateFlowView", () => {
  it("stays closed when the flow is not open", () => {
    assert.equal(
      resolveOpportunityCreateFlowView({
        open: false,
        isFromLead: true,
        existingCheckStatus: "success",
        hasExisting: true,
        forceCreate: false,
      }),
      "closed",
    );
  });

  it("shows checking while the existing-opportunity lookup is in flight", () => {
    assert.equal(
      resolveOpportunityCreateFlowView({
        open: true,
        isFromLead: true,
        existingCheckStatus: "loading",
        hasExisting: false,
        forceCreate: false,
      }),
      "checking",
    );
  });

  it("shows the existing-opportunity gate and never the form when a match exists", () => {
    assert.equal(
      resolveOpportunityCreateFlowView({
        open: true,
        isFromLead: true,
        existingCheckStatus: "success",
        hasExisting: true,
        forceCreate: false,
      }),
      "gate",
    );
  });

  it("opens the create form when no existing opportunity is found", () => {
    assert.equal(
      resolveOpportunityCreateFlowView({
        open: true,
        isFromLead: true,
        existingCheckStatus: "success",
        hasExisting: false,
        forceCreate: false,
      }),
      "form",
    );
  });

  it("opens the create form only after create-anyway", () => {
    assert.equal(
      resolveOpportunityCreateFlowView({
        open: true,
        isFromLead: true,
        existingCheckStatus: "success",
        hasExisting: true,
        forceCreate: true,
      }),
      "form",
    );
  });

  it("opens the form immediately for manual (non-lead) create", () => {
    assert.equal(
      resolveOpportunityCreateFlowView({
        open: true,
        isFromLead: false,
        existingCheckStatus: "idle",
        hasExisting: false,
        forceCreate: false,
      }),
      "form",
    );
  });
});
