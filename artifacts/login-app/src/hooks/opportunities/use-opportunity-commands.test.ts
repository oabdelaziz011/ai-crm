import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertApplicationCommandResult,
  legacyUnsafeCommandFailure,
  unwrapCommandResult,
} from "@/lib/application-layer/application-layer-result.ts";

describe("useOpportunityCommands createFromLead envelope handling", () => {
  it("regression: old result.ok guard throws undefined.message on successful CommandResult", () => {
    const successfulCommandResult = {
      data: { id: "opp-1", tenantId: "tenant-1", name: "Acme Opportunity" },
      correlationId: "corr-1",
      eventIds: [] as string[],
    };

    assert.throws(
      () => legacyUnsafeCommandFailure(successfulCommandResult),
      (error: unknown) =>
        error instanceof TypeError &&
        /Cannot read properties of undefined \(reading 'message'\)/.test(error.message),
    );
  });

  it("createFromLead mutation path returns opportunity id from CommandResult.data", () => {
    const opportunity = assertApplicationCommandResult<{ id: string; name: string }>({
      data: { id: "opp-new", name: "Acme Lead" },
      correlationId: "corr-2",
      eventIds: [],
    });

    assert.equal(opportunity.id, "opp-new");
  });
});

describe("useOpportunityCommands updateOpportunity envelope handling", () => {
  it("update returns opportunity from CommandResult.data", () => {
    const opportunity = unwrapCommandResult({
      data: { id: "opp-1", name: "Updated Deal", expectedRevenue: 50000 },
      correlationId: "corr-3",
      eventIds: [],
    });
    assert.equal(opportunity.name, "Updated Deal");
    assert.equal(opportunity.expectedRevenue, 50000);
  });
});

describe("useOpportunityCommands updateProbability envelope handling", () => {
  it("updateProbability returns opportunity with new percent from CommandResult.data", () => {
    const opportunity = unwrapCommandResult({
      data: { id: "opp-1", probabilityPercent: 75, weightedRevenue: 37500 },
      correlationId: "corr-4",
      eventIds: [],
    });
    assert.equal(opportunity.probabilityPercent, 75);
    assert.equal(opportunity.weightedRevenue, 37500);
  });
});

describe("useOpportunityCommands archiveOpportunity envelope handling", () => {
  it("archive accepts void CommandResult.data without result.ok", () => {
    assert.doesNotThrow(() => {
      unwrapCommandResult({
        data: undefined,
        correlationId: "corr-5",
        eventIds: [],
      });
    });
  });
});
