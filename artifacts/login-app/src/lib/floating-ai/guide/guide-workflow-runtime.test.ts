import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GuideEffectiveAuth } from "./guide-auth";
import {
  advanceGuideWorkflow,
  createGuideWorkflowRuntime,
  findGuideWorkflowById,
  guideWorkflowStorageKey,
  matchGuideWorkflow,
  type GuideWorkflowStorage,
} from "./guide-workflow-runtime";
import { GUIDE_ALLOWED_TOOL_KEYS } from "./guide-security";

function memoryStorage(): GuideWorkflowStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const allowedAuth: GuideEffectiveAuth = {
  userId: "u1",
  companyId: "c1",
  isSuperAdmin: true,
  permissionCodes: [],
  permissionsAvailable: true,
};

describe("guide workflow runtime (navigate + confirm only)", () => {
  it("re-exports existing workflow helpers", () => {
    assert.equal(typeof advanceGuideWorkflow, "function");
    assert.equal(findGuideWorkflowById("add_customer")?.id, "add_customer");
    assert.equal(matchGuideWorkflow("create ticket please")?.id, "create_ticket");
  });

  it("starts a workflow and records navigationRequested without marking any write success", () => {
    const rt = createGuideWorkflowRuntime({ conversationId: "c", storage: memoryStorage() });
    const state = rt.startWorkflow("add_customer");
    assert.deepEqual(state, {
      workflowId: "add_customer",
      stepIndex: 0,
      status: "awaiting_confirm",
      navigationRequested: true,
      navigationRouteId: "customers",
    });
    assert.notEqual(state?.status, "completed");
    rt.acknowledgeNavigation();
    assert.equal(rt.getState()?.navigationRequested, undefined);
    assert.equal(rt.getState()?.status, "awaiting_confirm");
  });

  it("returns null for unknown workflows", () => {
    const rt = createGuideWorkflowRuntime({ conversationId: "c", storage: memoryStorage() });
    assert.equal(rt.startWorkflow("nope"), null);
    assert.equal(rt.getState(), null);
  });

  it("starts from user text match and from workflow action", () => {
    const rt = createGuideWorkflowRuntime({ conversationId: "c", storage: memoryStorage() });
    assert.equal(rt.startFromMatch("hello there"), null);
    assert.equal(rt.startFromMatch("How do I connect WhatsApp?")?.workflowId, "connect_whatsapp");
    assert.equal(
      rt.startFromAction({ type: "workflow", workflowId: "create_ticket", stepIndex: 1 })?.stepIndex,
      1,
    );
    assert.equal(rt.startFromAction({ type: "navigate", routeId: "customers" }), null);
    // Out-of-range stepIndex falls back to the first step.
    assert.equal(
      rt.startFromAction({ type: "workflow", workflowId: "create_ticket", stepIndex: 99 })?.stepIndex,
      0,
    );
  });

  it("advances on confirm, completes at the end, and never claims a write", () => {
    const rt = createGuideWorkflowRuntime({ conversationId: "c", storage: memoryStorage() });
    rt.startWorkflow("create_ticket");
    const step2 = rt.confirmStep();
    assert.equal(step2?.stepIndex, 1);
    assert.equal(step2?.status, "active");
    assert.equal(step2?.navigationRequested, undefined);
    const done = rt.confirmStep();
    assert.equal(done?.status, "completed");
    assert.equal(done?.stepIndex, 1);
    // Terminal states are inert.
    assert.equal(rt.confirmStep()?.status, "completed");
    assert.equal(rt.cancelWorkflow()?.status, "completed");
  });

  it("goes back one step and re-requests navigation for steps that have a route", () => {
    const rt = createGuideWorkflowRuntime({ conversationId: "c", storage: memoryStorage() });
    rt.startWorkflow("add_customer");
    rt.confirmStep();
    assert.equal(rt.getState()?.stepIndex, 1);
    const back = rt.goBack();
    assert.equal(back?.stepIndex, 0);
    assert.equal(back?.navigationRouteId, "customers");
    assert.equal(rt.goBack()?.stepIndex, 0);
  });

  it("cancels an active workflow and clears persisted progress", () => {
    const storage = memoryStorage();
    const rt = createGuideWorkflowRuntime({ conversationId: "conv-1", storage });
    rt.startWorkflow("connect_whatsapp");
    assert.ok(storage.data.has(guideWorkflowStorageKey("conv-1")));
    assert.equal(rt.cancelWorkflow()?.status, "cancelled");
    assert.equal(storage.data.has(guideWorkflowStorageKey("conv-1")), false);
  });

  it("persists progress under valueor-guide-workflow:{conversationId} and resumes without re-navigating", () => {
    const storage = memoryStorage();
    const first = createGuideWorkflowRuntime({ conversationId: "conv-9", storage });
    first.startWorkflow("connect_whatsapp");
    first.confirmStep();
    assert.equal(guideWorkflowStorageKey("conv-9"), "valueor-guide-workflow:conv-9");
    const raw = JSON.parse(storage.data.get("valueor-guide-workflow:conv-9")!);
    assert.deepEqual(raw, { workflowId: "connect_whatsapp", stepIndex: 1, status: "awaiting_confirm" });

    const second = createGuideWorkflowRuntime({ conversationId: "conv-9", storage });
    const resumed = second.resume();
    assert.deepEqual(resumed, {
      workflowId: "connect_whatsapp",
      stepIndex: 1,
      status: "awaiting_confirm",
    });

    // Different conversation does not see it.
    const other = createGuideWorkflowRuntime({ conversationId: "conv-other", storage });
    assert.equal(other.resume(), null);
  });

  it("ignores corrupt or stale stored progress", () => {
    const storage = memoryStorage();
    storage.setItem("valueor-guide-workflow:x", "{not json");
    assert.equal(createGuideWorkflowRuntime({ conversationId: "x", storage }).resume(), null);
    storage.setItem(
      "valueor-guide-workflow:x",
      JSON.stringify({ workflowId: "connect_whatsapp", stepIndex: 50, status: "active" }),
    );
    assert.equal(createGuideWorkflowRuntime({ conversationId: "x", storage }).resume(), null);
    storage.setItem(
      "valueor-guide-workflow:x",
      JSON.stringify({ workflowId: "connect_whatsapp", stepIndex: 0, status: "completed" }),
    );
    assert.equal(createGuideWorkflowRuntime({ conversationId: "x", storage }).resume(), null);
  });

  it("denies when effective permissions fail and does not persist denial", () => {
    const storage = memoryStorage();
    const rt = createGuideWorkflowRuntime({
      conversationId: "d",
      storage,
      getAuth: () => ({ ...allowedAuth, isSuperAdmin: false, permissionCodes: [] }),
    });
    const state = rt.startWorkflow("add_customer");
    assert.equal(state?.status, "denied");
    assert.equal(state?.deniedReason, "missing_permissions");
    assert.equal(state?.navigationRequested, undefined);
    assert.equal(storage.data.size, 0);
    assert.equal(rt.confirmStep()?.status, "denied");
  });

  it("denies on missing auth context (fail closed) and on denied navigation", () => {
    const noCtx = createGuideWorkflowRuntime({
      conversationId: "d",
      storage: memoryStorage(),
      getAuth: () => ({ ...allowedAuth, userId: null }),
    });
    assert.equal(noCtx.startWorkflow("create_ticket")?.deniedReason, "missing_context");

    const rt = createGuideWorkflowRuntime({
      conversationId: "d",
      storage: memoryStorage(),
      getAuth: () => allowedAuth,
    });
    assert.equal(rt.startWorkflow("create_ticket")?.status, "awaiting_confirm");
    const denied = rt.denyWorkflow("navigation_denied");
    assert.equal(denied?.status, "denied");
    assert.equal(denied?.deniedReason, "navigation_denied");
  });

  it("re-checks permissions on resume", () => {
    const storage = memoryStorage();
    createGuideWorkflowRuntime({ conversationId: "r", storage }).startWorkflow("create_ticket");
    const rt = createGuideWorkflowRuntime({
      conversationId: "r",
      storage,
      getAuth: () => ({ ...allowedAuth, isSuperAdmin: false }),
    });
    assert.equal(rt.resume()?.status, "denied");
    assert.equal(storage.data.size, 0);
  });

  it("notifies subscribers and supports dismiss", () => {
    const rt = createGuideWorkflowRuntime({ conversationId: null, storage: memoryStorage() });
    let calls = 0;
    const unsubscribe = rt.subscribe(() => void (calls += 1));
    rt.startWorkflow("create_ticket");
    rt.dismiss();
    assert.equal(rt.getState(), null);
    unsubscribe();
    rt.startWorkflow("create_ticket");
    assert.equal(calls, 2);
  });

  it("keeps Guide tool allowlist empty", () => {
    assert.deepEqual(GUIDE_ALLOWED_TOOL_KEYS, []);
  });
});
