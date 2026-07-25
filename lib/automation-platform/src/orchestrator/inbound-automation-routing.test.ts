import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveInboundAutomationRoute } from "./inbound-automation-routing.js";
import type { AutomationRunRecord, ConversationSessionRecord } from "../types.js";

function session(overrides: Partial<ConversationSessionRecord> = {}): ConversationSessionRecord {
  return {
    id: "session-1",
    company_id: "company-1",
    channel: "whatsapp",
    external_user_id: "user-1",
    customer_id: null,
    flow_id: "flow-1",
    flow_version_id: "version-1",
    run_id: "run-1",
    current_node_id: "node-list",
    status: "waiting_input",
    started_at: "2026-07-24T00:00:00.000Z",
    last_activity_at: "2026-07-24T00:00:00.000Z",
    metadata: {},
    variables: { __waitingFor: "interactive_selection" },
    ...overrides,
  };
}

function run(overrides: Partial<AutomationRunRecord> = {}): AutomationRunRecord {
  return {
    id: "run-1",
    company_id: "company-1",
    flow_id: "flow-1",
    status: "waiting_input",
    trigger_source: "inbound_message",
    started_at: "2026-07-24T00:00:00.000Z",
    finished_at: null,
    error_message: null,
    metadata: { flowVersionId: "version-1" },
    flow_version_id: "version-1",
    current_node_id: "node-list",
    session_id: "session-1",
    variables: { __waitingFor: "interactive_selection" },
    ...overrides,
  };
}

describe("resolveInboundAutomationRoute", () => {
  it("resumes when waiting pins are intact", () => {
    const decision = resolveInboundAutomationRoute({
      boundFlowId: "flow-1",
      session: session(),
      run: run(),
    });

    assert.equal(decision.mode, "resume");
    assert.equal(decision.reason, "waiting_input_with_valid_execution_pins");
    assert.equal(decision.diagnostics.waitingInput, "interactive_selection");
  });

  it("abandons stale waiting rows missing current_node_id", () => {
    const decision = resolveInboundAutomationRoute({
      boundFlowId: "flow-1",
      session: session({ current_node_id: null }),
      run: run({ current_node_id: null }),
    });

    assert.equal(decision.mode, "abandon_and_start");
    assert.equal(decision.reason, "stale_waiting_input_missing_execution_pins");
  });

  it("starts when no active session exists", () => {
    const decision = resolveInboundAutomationRoute({
      boundFlowId: "flow-1",
      session: null,
      run: null,
    });

    assert.equal(decision.mode, "start");
    assert.equal(decision.reason, "no_active_session");
  });

  it("holds only very recent actively executing runs", () => {
    const decision = resolveInboundAutomationRoute({
      boundFlowId: "flow-1",
      session: session({
        status: "running",
        last_activity_at: new Date().toISOString(),
      }),
      run: run({
        status: "running",
        variables: {},
      }),
    });

    assert.equal(decision.mode, "hold_active_session");
    assert.equal(decision.reason, "active_session_executing_recently");
  });

  it("abandons orphaned running sessions that are not waiting for input", () => {
    const decision = resolveInboundAutomationRoute({
      boundFlowId: "flow-1",
      session: session({
        status: "running",
        last_activity_at: "2026-07-24T00:00:00.000Z",
      }),
      run: run({
        status: "running",
        variables: {},
      }),
    });

    assert.equal(decision.mode, "abandon_and_start");
    assert.equal(decision.reason, "orphaned_active_run_not_waiting_for_input");
  });
});
