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

  it("allows the happy-path clinic transitions", () => {
    assert.equal(engine.canTransition("confirmed", "checked_in"), true);
    assert.equal(engine.canTransition("checked_in", "with_nurse"), true);
    assert.equal(engine.canTransition("with_nurse", "in_progress"), true);
    assert.equal(engine.canTransition("in_progress", "completed"), true);
    assert.equal(engine.canTransition("completed", "archived"), true);
  });

  it("blocks invalid transitions", () => {
    assert.equal(engine.canTransition("checked_in", "completed"), false);
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

    const doctorComplete = engine.findTransitionForAction("appointments.complete_visit", "in_progress", {
      actorRole: "doctor",
    });
    assert.ok(doctorComplete);
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
