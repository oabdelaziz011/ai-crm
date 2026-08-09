import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  legacyUnsafeCommandFailure,
  unwrapCommandResult,
  unwrapQueryResult,
} from "@/lib/application-layer/application-layer-result.ts";

describe("useQuoteCommands application-layer envelope handling", () => {
  it("regression: old result.ok guard throws undefined.message on successful CommandResult", () => {
    assert.throws(
      () =>
        legacyUnsafeCommandFailure({
          data: { id: "quote-1", quoteNumber: "Q-1001" },
          correlationId: "corr-1",
          eventIds: [],
        }),
      (error: unknown) =>
        error instanceof TypeError &&
        /Cannot read properties of undefined \(reading 'message'\)/.test(error.message),
    );
  });

  it("createFromOpportunity returns quote payload from CommandResult.data", () => {
    const payload = unwrapCommandResult({
      data: { quote: { id: "quote-1" }, lines: [] },
      correlationId: "corr-2",
      eventIds: [],
    });
    assert.equal(payload.quote.id, "quote-1");
  });

  it("createVersion returns quote from CommandResult.data", () => {
    const quote = unwrapCommandResult({
      data: { id: "quote-v2", versionNumber: 2 },
      correlationId: "corr-3",
      eventIds: [],
    });
    assert.equal(quote.versionNumber, 2);
  });

  it("changeStatus returns quote from CommandResult.data", () => {
    const quote = unwrapCommandResult({
      data: { id: "quote-1", status: "sent" },
      correlationId: "corr-4",
      eventIds: [],
    });
    assert.equal(quote.status, "sent");
  });

  it("decideApproval returns quote from CommandResult.data", () => {
    const quote = unwrapCommandResult({
      data: { id: "quote-1", status: "approved" },
      correlationId: "corr-5",
      eventIds: [],
    });
    assert.equal(quote.status, "approved");
  });

  it("requestApproval returns quote from CommandResult.data", () => {
    const quote = unwrapCommandResult({
      data: { id: "quote-1", status: "pending_approval" },
      correlationId: "corr-6",
      eventIds: [],
    });
    assert.equal(quote.status, "pending_approval");
  });

  it("listQuotes returns items from QueryResult.data", () => {
    const list = unwrapQueryResult({
      data: { items: [{ id: "quote-1" }], total: 1 },
      correlationId: "corr-7",
    });
    assert.equal(list.total, 1);
  });

  it("getQuote360 aggregates QueryResult.data envelopes", () => {
    const quote = unwrapQueryResult({
      data: { id: "quote-1", quoteFamilyId: "family-1" },
      correlationId: "corr-8",
    });
    const lines = unwrapQueryResult({
      data: [{ id: "line-1" }],
      correlationId: "corr-9",
    });
    assert.equal(quote.id, "quote-1");
    assert.equal(lines.length, 1);
  });
});
