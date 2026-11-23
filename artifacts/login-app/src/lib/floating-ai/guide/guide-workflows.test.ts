import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  advanceGuideWorkflow,
  findGuideWorkflowById,
  matchGuideWorkflow,
} from "./guide-workflows";

describe("Phase 1C interactive guidance workflows", () => {
  it("matches connect whatsapp intent across languages", () => {
    assert.equal(matchGuideWorkflow("How do I connect WhatsApp?")?.id, "connect_whatsapp");
    assert.equal(matchGuideWorkflow("أريد ربط واتساب")?.id, "connect_whatsapp");
    assert.equal(matchGuideWorkflow("WhatsApp verbinden bitte")?.id, "connect_whatsapp");
  });

  it("requires confirmation before advancing waiting steps", () => {
    const workflow = findGuideWorkflowById("add_customer");
    assert.ok(workflow);
    const stuck = advanceGuideWorkflow({ workflowId: "add_customer", stepIndex: 0 }, false);
    assert.deepEqual(stuck, { workflowId: "add_customer", stepIndex: 0 });
    const next = advanceGuideWorkflow({ workflowId: "add_customer", stepIndex: 0 }, true);
    assert.deepEqual(next, { workflowId: "add_customer", stepIndex: 1 });
  });

  it("ends when steps are exhausted", () => {
    const last = advanceGuideWorkflow({ workflowId: "create_ticket", stepIndex: 1 }, true);
    assert.equal(last, null);
  });

  it("keeps step navigate targets on real registry routes", () => {
    const wa = findGuideWorkflowById("connect_whatsapp");
    assert.equal(wa?.steps[0]?.navigateRouteId, "whatsapp");
    assert.equal(wa?.requiredTask, "whatsapp.view");
  });
});
