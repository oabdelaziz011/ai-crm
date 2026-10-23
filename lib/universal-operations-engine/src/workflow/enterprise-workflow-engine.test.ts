import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { EnterpriseWorkflowEngine } from "./enterprise-workflow-engine.js";
import { WORKFLOW_PACK_CLINIC } from "../config/seed/workflow-packs/clinic-workflow.js";
import { WORKFLOW_PACK_CONSTRUCTION_EXAMPLE } from "../config/seed/workflow-packs/construction-workflow.example.js";
import {
  registerDefaultWorkflows,
  resetWorkflowRegistryForTests,
} from "./register-default-workflows.js";
import { workflowRegistry } from "./workflow-registry.js";

describe("EnterpriseWorkflowEngine — clinic pack", () => {
  const engine = new EnterpriseWorkflowEngine(WORKFLOW_PACK_CLINIC);

  it("allows the happy-path transitions: check in, then done", () => {
    assert.equal(engine.canTransition("confirmed", "checked_in"), true);
    assert.equal(engine.canTransition("checked_in", "completed"), true);
    assert.equal(engine.canTransition("completed", "archived"), true);
  });

  it("lets bookings left in legacy nurse/doctor states finish", () => {
    assert.equal(engine.canTransition("with_nurse", "completed"), true);
    assert.equal(engine.canTransition("in_progress", "completed"), true);
  });

  it("has no nurse/doctor steps in the journey", () => {
    assert.equal(engine.canTransition("checked_in", "with_nurse"), false);
    assert.equal(engine.canTransition("checked_in", "in_progress"), false);
    const stageIds = engine.getDefinition().stages.map((stage) => stage.id);
    assert.deepEqual(stageIds, ["waiting", "checked_in", "completed", "archived"]);
  });

  it("blocks invalid transitions", () => {
    assert.equal(engine.canTransition("confirmed", "completed"), false);
    assert.equal(engine.canTransition("waiting", "in_progress"), false);
    assert.throws(() => engine.assertTransition("archived", "checked_in"), /INVALID_STATUS_TRANSITION/);
  });

  it("gates actions by state and role via transitions", () => {
    const checkIn = engine.findTransitionForAction("appointments.check_in", "confirmed", {
      actorRole: "reception",
    });
    assert.ok(checkIn);
    assert.equal(checkIn.to, "checked_in");

    const nurseDenied = engine.findTransitionForAction("appointments.check_in", "confirmed", {
      actorRole: "nurse",
    });
    assert.equal(nurseDenied, undefined);

    const receptionComplete = engine.findTransitionForAction("appointments.complete_visit", "checked_in", {
      actorRole: "reception",
    });
    assert.ok(receptionComplete);
    assert.equal(receptionComplete.to, "completed");
  });

  it("exposes KPI buckets without UI hardcoding", () => {
    assert.ok(engine.kpiStatusInternalNames("waiting").includes("confirmed"));
    assert.ok(engine.kpiStatusInternalNames("in_progress").includes("with_nurse"));
  });
});

describe("WorkflowRegistry — multi-industry extensibility", () => {
  beforeEach(() => {
    resetWorkflowRegistryForTests();
  });

  it("registers clinic and construction example without engine changes", () => {
    registerDefaultWorkflows({ includeExamples: true });
    assert.equal(workflowRegistry.hasTemplate("clinic"), true);
    assert.equal(workflowRegistry.hasTemplate("construction"), true);

    const construction = workflowRegistry.requireEngine("construction");
    assert.equal(construction.canTransition("planning", "assigned"), true);
    assert.equal(construction.canTransition("assigned", "in_progress"), true);
    assert.equal(construction.getDefinition().id, WORKFLOW_PACK_CONSTRUCTION_EXAMPLE.id);
  });
});
