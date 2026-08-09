import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  legacyUnsafeCommandFailure,
  unwrapCommandResult,
  unwrapQueryResult,
} from "@/lib/application-layer/application-layer-result.ts";

describe("useProductCommands application-layer envelope handling", () => {
  it("regression: old result.ok guard throws undefined.message on successful CommandResult", () => {
    assert.throws(
      () =>
        legacyUnsafeCommandFailure({
          data: { id: "prod-1", name: "Widget" },
          correlationId: "corr-1",
          eventIds: [],
        }),
      (error: unknown) =>
        error instanceof TypeError &&
        /Cannot read properties of undefined \(reading 'message'\)/.test(error.message),
    );
  });

  it("create returns product from CommandResult.data", () => {
    const product = unwrapCommandResult({
      data: { id: "prod-1", name: "Widget", sku: "W-1" },
      correlationId: "corr-1",
      eventIds: [],
    });
    assert.equal(product.id, "prod-1");
  });

  it("attachToOpportunity returns line from CommandResult.data", () => {
    const line = unwrapCommandResult({
      data: { id: "line-1", productId: "prod-1", quantity: 2 },
      correlationId: "corr-2",
      eventIds: [],
    });
    assert.equal(line.id, "line-1");
  });

  it("updateLine returns line from CommandResult.data", () => {
    const line = unwrapCommandResult({
      data: { id: "line-1", quantity: 5, unitPrice: 120, discountPercent: 10 },
      correlationId: "corr-3",
      eventIds: [],
    });
    assert.equal(line.quantity, 5);
    assert.equal(line.unitPrice, 120);
    assert.equal(line.discountPercent, 10);
  });

  it("updateLine regression: quantity-only patch unwraps without result.ok", () => {
    const line = unwrapCommandResult({
      data: { id: "line-1", quantity: 3 },
      correlationId: "corr-3b",
      eventIds: [],
    });
    assert.equal(line.quantity, 3);
  });

  it("removeLine accepts void CommandResult.data without result.ok", () => {
    assert.doesNotThrow(() => {
      unwrapCommandResult({
        data: undefined,
        correlationId: "corr-4",
        eventIds: [],
      });
    });
  });

  it("listOpportunityLines returns items from QueryResult.data", () => {
    const lines = unwrapQueryResult({
      data: [{ id: "line-1" }, { id: "line-2" }],
      correlationId: "corr-5",
    });
    assert.equal(lines.length, 2);
  });

  it("listProducts returns catalog from QueryResult.data", () => {
    const catalog = unwrapQueryResult({
      data: { items: [{ id: "prod-1" }], total: 1 },
      correlationId: "corr-6",
    });
    assert.equal(catalog.total, 1);
  });
});
