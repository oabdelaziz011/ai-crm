import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isDemoScheduledLifecycle,
  isOpportunityVisibleInModule,
} from "./demo-opportunity-visibility.js";

describe("isOpportunityVisibleInModule", () => {
  it("hides opportunities that are not tied to a lead in the فرصة column", () => {
    assert.equal(isOpportunityVisibleInModule({ leadId: null, leadLifecycleStatus: null }), false);
  });

  it("hides opportunities while the linked lead is demo_scheduled", () => {
    assert.equal(
      isOpportunityVisibleInModule({
        leadId: "lead-1",
        leadLifecycleStatus: "demo_scheduled",
      }),
      false,
    );
  });

  it("shows opportunities only once the lead reaches demo_completed (Kanban فرصة) or later", () => {
    assert.equal(
      isOpportunityVisibleInModule({
        leadId: "lead-1",
        leadLifecycleStatus: "demo_completed",
      }),
      true,
    );
    assert.equal(
      isOpportunityVisibleInModule({
        leadId: "lead-1",
        leadLifecycleStatus: "qualified",
      }),
      false,
    );
    assert.equal(
      isOpportunityVisibleInModule({
        leadId: "lead-1",
        leadLifecycleStatus: "new",
      }),
      false,
    );
    assert.equal(
      isOpportunityVisibleInModule({
        leadId: "lead-1",
        leadLifecycleStatus: "contacted",
      }),
      false,
    );
    assert.equal(
      isOpportunityVisibleInModule({
        leadId: "lead-1",
        leadLifecycleStatus: "proposal_sent",
      }),
      true,
    );
  });

  it("display labels are not the visibility gate", () => {
    assert.equal(isDemoScheduledLifecycle("demo_completed"), false);
    assert.equal(isDemoScheduledLifecycle("Opportunity"), false);
    assert.equal(
      isOpportunityVisibleInModule({
        leadId: "lead-1",
        leadLifecycleStatus: "demo_completed",
      }),
      true,
    );
  });
});

describe("isDemoScheduledLifecycle", () => {
  it("matches only demo_scheduled", () => {
    assert.equal(isDemoScheduledLifecycle("demo_scheduled"), true);
    assert.equal(isDemoScheduledLifecycle("demo_completed"), false);
  });
});
