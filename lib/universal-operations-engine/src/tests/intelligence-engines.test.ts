import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { intelligenceOrchestrator } from "../intelligence/intelligence-orchestrator.js";
import { buildMockCustomer360Workspace } from "../mock/mock-panel-data.js";
import { alertEngine } from "../intelligence/alert-engine.js";
import { contextEngine } from "../intelligence/context-engine.js";
import { workflowEngine } from "../intelligence/workflow-engine.js";

describe("Intelligence engines", () => {
  const ctx = buildMockCustomer360Workspace("row_1", "Sara Hassan");

  it("builds clinic journey from metadata", () => {
    const journey = contextEngine.buildJourney("clinic");
    assert.ok(journey.some((s) => s.status === "current"));
    assert.ok(journey.filter((s) => s.status === "completed").length > 0);
  });

  it("builds HR journey for hr template", () => {
    const journey = contextEngine.buildJourney("hr");
    assert.equal(journey.find((s) => s.id === "website")?.status, "completed");
  });

  it("evaluates alerts from customer context", () => {
    const alerts = alertEngine.evaluate(ctx);
    assert.ok(alerts.some((a) => a.alertType === "vip"));
    assert.ok(alerts.some((a) => a.alertType === "outstanding"));
  });

  it("builds workflow tracker with active stage", () => {
    const stages = workflowEngine.buildTracker("checked_in");
    assert.equal(stages.find((s) => s.id === "checked_in")?.state, "active");
    assert.equal(stages.find((s) => s.id === "booked")?.state, "done");
  });

  it("orchestrator produces full intelligence snapshot", () => {
    const snapshot = intelligenceOrchestrator.buildSnapshot("clinic", ctx);
    assert.ok(snapshot.journey.length > 0);
    assert.ok(snapshot.recommendations.length > 0);
    assert.ok(snapshot.quickDecision.nextAction.length > 0);
    assert.ok(snapshot.communicationGroups.length > 0);
  });
});
