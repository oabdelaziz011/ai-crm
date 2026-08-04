import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { intelligenceOrchestrator } from "../intelligence/intelligence-orchestrator.js";
import { buildMockCustomer360Workspace } from "../mock/mock-panel-data.js";
import { buildDefaultOperationsWorkspaceConfig } from "../config/default-operations-workspace-config.js";
import { buildEmptyCustomer360Workspace } from "../runtime/empty-customer360-workspace.js";
import {
  createConfiguredAlertEngine,
  createConfiguredWorkflowEngine,
} from "../intelligence/config-driven-intelligence.js";
import { contextEngine } from "../intelligence/context-engine.js";
import { OperationsRuntimeConfigurationError } from "../runtime/runtime-configuration-error.js";

describe("Intelligence engines", () => {
  const config = buildDefaultOperationsWorkspaceConfig("clinic", "test-company");
  const ctx = buildMockCustomer360Workspace("row_1", "Sara Hassan");

  it("builds journey from published configuration", () => {
    const journey = contextEngine.buildJourney(config.intelligence.journeySteps, "doctor");
    assert.ok(journey.some((s) => s.status === "current"));
    assert.ok(journey.filter((s) => s.status === "completed").length > 0);
  });

  it("throws when journey steps are missing", () => {
    assert.throws(
      () => contextEngine.buildJourney([], "doctor"),
      OperationsRuntimeConfigurationError,
    );
  });

  it("evaluates alerts from configured rules", () => {
    const alertEngine = createConfiguredAlertEngine(config.intelligence);
    const alerts = alertEngine.evaluate(ctx);
    assert.ok(alerts.some((a) => a.alertType === "vip"));
    assert.ok(alerts.some((a) => a.alertType === "outstanding"));
  });

  it("builds workflow tracker with active stage", () => {
    const workflowEngine = createConfiguredWorkflowEngine(config.intelligence);
    const stages = workflowEngine.buildTracker("checked_in");
    assert.equal(stages.find((s) => s.id === "checked_in")?.state, "active");
    assert.equal(stages.find((s) => s.id === "booked")?.state, "done");
  });

  it("orchestrator produces full intelligence snapshot from configuration", () => {
    const snapshot = intelligenceOrchestrator.buildSnapshot(
      ctx,
      config.intelligence,
      config.businessContext,
      config.ai,
    );
    assert.ok(snapshot.journey.length > 0);
    assert.ok(snapshot.recommendations.length > 0);
    assert.ok(snapshot.quickDecision.nextAction.length > 0);
    assert.ok(snapshot.communicationGroups.length > 0);
    assert.ok(snapshot.businessContext.some((f) => f.label === "Patient"));
  });

  it("throws when building snapshot for empty customer workspace", () => {
    assert.throws(
      () =>
        intelligenceOrchestrator.buildSnapshot(
          buildEmptyCustomer360Workspace(),
          config.intelligence,
          config.businessContext,
          config.ai,
        ),
      OperationsRuntimeConfigurationError,
    );
  });
});
