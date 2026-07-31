import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveInboundAutomationContext } from "./inbound-automation-context.js";
import type { AutomationRunRecord, ConversationSessionRecord } from "../types.js";

function session(overrides: Partial<ConversationSessionRecord> = {}): ConversationSessionRecord {
  return {
    id: "session-waiting",
    company_id: "company-1",
    channel: "whatsapp",
    external_user_id: "user-1",
    customer_id: null,
    flow_id: "flow-1",
    flow_version_id: "version-1",
    run_id: "run-1",
    current_node_id: "node-list",
    status: "waiting_input",
    started_at: "2026-07-30T00:00:00.000Z",
    last_activity_at: new Date().toISOString(),
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
    started_at: "2026-07-30T00:00:00.000Z",
    finished_at: null,
    error_message: null,
    metadata: {},
    flow_version_id: "version-1",
    current_node_id: "node-list",
    session_id: "session-waiting",
    variables: { __waitingFor: "interactive_selection" },
    ...overrides,
  };
}

describe("resolveInboundAutomationContext", () => {
  it("prefers non-expired waiting_input session over stale running session", async () => {
    const waiting = session();

    const context = await resolveInboundAutomationContext(
      {
        sessions: {
          async findActiveSession(input) {
            if (input.preferStatus === "waiting_input" && input.activitySince) return waiting;
            if (!input.activitySince && !input.preferStatus) {
              return session({
                id: "session-stale",
                status: "running",
                last_activity_at: "2026-07-24T00:00:00.000Z",
              });
            }
            return null;
          },
        } as never,
        runs: {
          async findById(id) {
            return id === "run-1" ? run() : null;
          },
          async findBySessionId() {
            return null;
          },
        } as never,
      },
      {
        companyId: "company-1",
        channel: "whatsapp",
        externalUserId: "user-1",
        boundFlowId: "flow-1",
      },
    );

    assert.equal(context.lookup.strategy, "waiting_input_session");
    assert.equal(context.session?.id, "session-waiting");
    assert.equal(context.expired, false);
    assert.equal(context.run?.id, "run-1");
  });
});
