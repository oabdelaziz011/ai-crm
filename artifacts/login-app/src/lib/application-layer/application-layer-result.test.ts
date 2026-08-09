import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertApplicationCommandResult,
  legacyUnsafeCommandFailure,
  resolveApplicationErrorMessage,
  unwrapCommandResult,
  unwrapQueryResult,
} from "./application-layer-result.ts";

describe("application-layer-result", () => {
  it("unwrapCommandResult returns data from the canonical CommandResult envelope", () => {
    const data = unwrapCommandResult({
      data: { id: "opp-1", name: "Acme Opportunity" },
      correlationId: "corr-1",
      eventIds: [],
    });
    assert.equal(data.id, "opp-1");
  });

  it("unwrapQueryResult returns data from the canonical QueryResult envelope", () => {
    const data = unwrapQueryResult({
      data: { items: [{ id: "prod-1" }], total: 1 },
      correlationId: "corr-q1",
    });
    assert.equal(data.total, 1);
  });

  it("regression: legacy ok/error check crashes on canonical CommandResult (undefined.message)", () => {
    const canonicalResult = {
      data: { id: "opp-1" },
      correlationId: "corr-1",
      eventIds: [] as string[],
    };

    assert.throws(
      () => legacyUnsafeCommandFailure(canonicalResult),
      (error: unknown) =>
        error instanceof TypeError &&
        /Cannot read properties of undefined \(reading 'message'\)/.test(error.message),
    );
  });

  it("regression: assertApplicationCommandResult succeeds for canonical CommandResult", () => {
    const id = assertApplicationCommandResult<{ id: string }>({
      data: { id: "opp-1" },
      correlationId: "corr-1",
      eventIds: [],
    });
    assert.equal(id.id, "opp-1");
  });

  it("resolveApplicationErrorMessage never reads message from undefined", () => {
    assert.equal(resolveApplicationErrorMessage(undefined), "Unknown error");
    assert.equal(resolveApplicationErrorMessage({ ok: false }), "Unknown error");
    assert.equal(
      resolveApplicationErrorMessage({ error: { message: "Permission denied" } }),
      "Permission denied",
    );
    assert.equal(resolveApplicationErrorMessage(new Error("Lead not found")), "Lead not found");
  });
});
