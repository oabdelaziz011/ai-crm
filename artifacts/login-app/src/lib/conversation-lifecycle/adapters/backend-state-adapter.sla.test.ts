import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readLifecycleOverlay, writeLifecycleOverlay } from "./backend-state-adapter.ts";

describe("writeLifecycleOverlay SLA preservation", () => {
  it("preserves slaDueAt when a partial overlay write omits it", () => {
    const withSla = writeLifecycleOverlay(
      {},
      { state: "AI_HANDLING", slaDueAt: "2026-09-05T18:00:00.000Z" },
    );
    const next = writeLifecycleOverlay(withSla, {
      state: "ASSIGNED",
      owner: { kind: "user", id: "u1", label: "Agent" },
    });
    assert.equal(readLifecycleOverlay(next)?.slaDueAt, "2026-09-05T18:00:00.000Z");
    assert.equal(readLifecycleOverlay(next)?.state, "ASSIGNED");
  });

  it("allows explicit slaDueAt overwrite (e.g. reopen reset)", () => {
    const withSla = writeLifecycleOverlay(
      {},
      { state: "CLOSED", slaDueAt: "2026-09-01T00:00:00.000Z" },
    );
    const next = writeLifecycleOverlay(withSla, {
      state: "REOPENED",
      slaDueAt: "2026-09-05T14:00:00.000Z",
    });
    assert.equal(readLifecycleOverlay(next)?.slaDueAt, "2026-09-05T14:00:00.000Z");
  });
});
