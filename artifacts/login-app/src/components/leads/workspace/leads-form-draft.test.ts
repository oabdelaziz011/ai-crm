import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  leadFormDraftToUpdatePatch,
  leadToFormDraft,
  type LeadEditSource,
} from "./leads-form-draft.ts";

const sampleLead: LeadEditSource = {
  name: "Acme expansion",
  contactPerson: "Sara Hassan",
  email: "sara@acme.test",
  phone: "+966501234567",
  companyName: "Acme",
  stageId: "stage-1",
  ownerId: "user-1",
  sourceId: "source-1",
  expectedValue: 12000,
  expectedCloseDate: "2026-09-15T00:00:00.000Z",
  priority: "high",
  temperature: "hot",
  tags: ["vip"],
  notes: "Follow up Friday",
};

describe("leadToFormDraft / leadFormDraftToUpdatePatch", () => {
  it("maps a lead row into the shared edit form draft", () => {
    const draft = leadToFormDraft(sampleLead);
    assert.equal(draft.name, "Acme expansion");
    assert.equal(draft.email, "sara@acme.test");
    assert.equal(draft.expectedCloseDate, "2026-09-15");
    assert.equal(draft.expectedValue, "12000");
    assert.deepEqual(draft.tags, ["vip"]);
  });

  it("maps edit draft to updateLead patch fields (no duplicate update service)", () => {
    const draft = leadToFormDraft(sampleLead);
    draft.name = "Acme expansion v2";
    draft.expectedValue = "15000";
    const patch = leadFormDraftToUpdatePatch(draft);
    assert.equal(patch.name, "Acme expansion v2");
    assert.equal(patch.contactPerson, "Sara Hassan");
    assert.equal(patch.expectedValue, 15000);
    assert.equal(patch.email, "sara@acme.test");
    assert.equal(patch.stageId, "stage-1");
    assert.equal(patch.ownerId, "user-1");
    assert.equal(patch.temperature, "hot");
  });

  it("normalizes empty optional contact fields to null for updateLead", () => {
    const draft = leadToFormDraft({
      ...sampleLead,
      email: null,
      phone: null,
      companyName: null,
      ownerId: null,
      sourceId: null,
      expectedValue: null,
      temperature: null,
    });
    const patch = leadFormDraftToUpdatePatch(draft);
    assert.equal(patch.email, null);
    assert.equal(patch.phone, null);
    assert.equal(patch.companyName, null);
    assert.equal(patch.ownerId, null);
    assert.equal(patch.sourceId, null);
    assert.equal(patch.expectedValue, null);
    assert.equal(patch.temperature, null);
  });
});
