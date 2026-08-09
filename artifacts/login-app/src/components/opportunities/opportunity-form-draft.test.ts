import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLeadOpportunityFormSeed,
  opportunityFormDraftToCreateFromLeadInput,
  validateOpportunityFormDraft,
} from "./opportunity-form-draft";

const t = (key: string) => key;

describe("buildLeadOpportunityFormSeed", () => {
  it("seeds deal name from lead title, not contact person", () => {
    const draft = buildLeadOpportunityFormSeed(
      {
        id: "lead-1",
        name: "Enterprise rollout",
        contactPerson: "Jane Doe",
        companyName: "Acme",
        email: "jane@example.com",
        phone: "+201000000000",
        ownerId: "user-1",
        expectedValue: 5000,
        currency: "USD",
        expectedCloseDate: "2026-12-31",
        stage: "Qualified",
      },
      {
        companyCurrency: "EGP",
        defaultOwnerUserId: "user-2",
        defaultStageId: "stage-1",
        defaultPipelineId: "pipe-1",
      },
    );

    assert.equal(draft.name, "Acme — Enterprise rollout");
    assert.equal(draft.primaryContactName, "Jane Doe");
    assert.equal(draft.currency, "EGP");
    assert.equal(draft.ownerUserId, "user-1");
  });
});

describe("opportunityFormDraftToCreateFromLeadInput", () => {
  it("maps commercial fields for createFromLead command", () => {
    const payload = opportunityFormDraftToCreateFromLeadInput("lead-1", {
      name: "Acme — Deal",
      companyName: "Acme",
      primaryContactName: "Jane",
      expectedRevenue: "12000",
      currency: "EGP",
      expectedCloseDate: "2026-06-30",
      stageId: "stage-1",
      ownerUserId: "user-1",
      pipelineId: "pipe-1",
    });

    assert.deepEqual(payload, {
      leadId: "lead-1",
      name: "Acme — Deal",
      companyName: "Acme",
      primaryContactName: "Jane",
      ownerUserId: "user-1",
      expectedRevenue: 12000,
      currency: "EGP",
      expectedCloseDate: "2026-06-30",
      stageId: "stage-1",
      pipelineId: "pipe-1",
    });
  });
});

describe("validateOpportunityFormDraft", () => {
  it("requires name, stage, owner, and currency", () => {
    const errors = validateOpportunityFormDraft(
      {
        name: "",
        companyName: "",
        primaryContactName: "",
        expectedRevenue: "",
        currency: "",
        expectedCloseDate: "",
        stageId: "",
        ownerUserId: "",
        pipelineId: "",
      },
      t,
    );

    assert.ok(errors.name);
    assert.ok(errors.stageId);
    assert.ok(errors.ownerUserId);
    assert.ok(errors.currency);
  });

  it("accepts a draft when stageId is auto-resolved", () => {
    const errors = validateOpportunityFormDraft(
      {
        name: "Acme — Deal",
        companyName: "Acme",
        primaryContactName: "Jane",
        expectedRevenue: "1000",
        currency: "EGP",
        expectedCloseDate: "2026-06-30",
        stageId: "stage-1",
        ownerUserId: "user-1",
        pipelineId: "pipe-1",
      },
      t,
    );

    assert.equal(Object.keys(errors).length, 0);
  });
});
