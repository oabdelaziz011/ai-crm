import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickLeastLoadedDeliveryWorker } from "./delivery-assignment-picker.js";

describe("pickLeastLoadedDeliveryWorker", () => {
  it("picks the worker with the lowest open load", () => {
    const id = pickLeastLoadedDeliveryWorker([
      { workerId: "a", openAssignedCount: 3, lastAssignedAt: "2026-01-01T00:00:00.000Z" },
      { workerId: "b", openAssignedCount: 1, lastAssignedAt: "2026-01-02T00:00:00.000Z" },
      { workerId: "c", openAssignedCount: 2, lastAssignedAt: null },
    ]);
    assert.equal(id, "b");
  });

  it("tie-breaks by oldest lastAssignedAt then workerId", () => {
    const id = pickLeastLoadedDeliveryWorker([
      { workerId: "z", openAssignedCount: 1, lastAssignedAt: "2026-01-02T00:00:00.000Z" },
      { workerId: "a", openAssignedCount: 1, lastAssignedAt: "2026-01-01T00:00:00.000Z" },
      { workerId: "m", openAssignedCount: 1, lastAssignedAt: null },
    ]);
    assert.equal(id, "m");
  });

  it("returns null for empty candidates", () => {
    assert.equal(pickLeastLoadedDeliveryWorker([]), null);
  });
});
