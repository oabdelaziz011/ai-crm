import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compareLeadKanbanStages } from "./lead-kanban-stage-order.js";

describe("lead kanban stage order", () => {
  it("places فرصة after quote sent", () => {
    const stages = [
      { lifecycleStatus: "demo_scheduled", sortOrder: 4 },
      { lifecycleStatus: "demo_completed", sortOrder: 5 },
      { lifecycleStatus: "proposal_sent", sortOrder: 6 },
      { lifecycleStatus: "negotiation", sortOrder: 7 },
    ];
    const ordered = [...stages].sort(compareLeadKanbanStages).map((stage) => stage.lifecycleStatus);
    assert.deepEqual(ordered, ["demo_scheduled", "proposal_sent", "demo_completed", "negotiation"]);
  });
});