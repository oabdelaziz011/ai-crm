import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  executeHandoffToHumanAction,
  validateHandoffToHumanConfig,
} from "./handoff-to-human-action.js";
import type { HandoffServicePort } from "../../ports/handoff-service-port.js";
import type { ExecutionContext } from "../execution-context.js";

function createContext(config: Record<string, unknown>, variables: Record<string, unknown> = {}): ExecutionContext {
  return {
    company: { id: "company-1" },
    flow: {
      id: "flow-1",
      company_id: "company-1",
      name: "Flow",
      description: "",
      trigger_type: "inbound_message",
      status: "active",
      version: 1,
      metadata: {},
      active_version_id: null,
      has_unpublished_draft: false,
      created_by: null,
      updated_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      deleted_by: null,
    },
    run: {
      id: "run-1",
      company_id: "company-1",
      flow_id: "flow-1",
      session_id: "session-1",
      status: "running",
      trigger_source: "manual",
      current_node_id: "node-handoff",
      variables,
      metadata: {},
      error_message: null,
      started_at: new Date().toISOString(),
      finished_at: null,
      flow_version_id: "version-1",
    },
    session: {
      id: "session-1",
      company_id: "company-1",
      channel: "whatsapp",
      external_user_id: "ext-1",
      customer_id: "cust-1",
      flow_id: "flow-1",
      run_id: "run-1",
      current_node_id: "node-handoff",
      status: "running",
      started_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
      metadata: {},
      variables,
    },
    variables: {
      conversationId: "conv-1",
      ...variables,
    },
    customer: { id: "cust-1" },
    currentNode: {
      id: "node-handoff",
      flow_id: "flow-1",
      type: "action",
      config,
      position_x: 0,
      position_y: 0,
      created_at: new Date().toISOString(),
    },
    nodes: [],
    edges: [],
  };
}

describe("handoff_to_human workflow action", () => {
  it("calls HandoffService with company and conversation context", async () => {
    const calls: unknown[] = [];
    const handoffService: HandoffServicePort = {
      async requestCustomerHandoff(input) {
        calls.push(input);
        return {
          ownership: { ownerType: "human_agent", ownerLabel: "Agent" },
          assigned: true,
          queued: false,
          assigneeUserId: "agent-1",
        };
      },
    };

    const result = await executeHandoffToHumanAction(
      createContext({
        action: "handoff_to_human",
        triggerCode: "customer_requested",
        reason: "Customer requested human support",
      }),
      {
        action: "handoff_to_human",
        triggerCode: "customer_requested",
        reason: "Customer requested human support",
      },
      handoffService,
    );

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      companyId: "company-1",
      conversationId: "conv-1",
      queueId: undefined,
      reason: "Customer requested human support",
      triggerCode: "customer_requested",
      aiAssistantId: undefined,
    });
    assert.equal(result.outcome, "continue");
    assert.equal(result.variables?.__handoffCompleted, true);
    assert.equal(result.output?.handoff?.assigned, true);
  });

  it("rejects invalid triggerCode at validation time", () => {
    assert.throws(
      () =>
        validateHandoffToHumanConfig({
          action: "handoff_to_human",
          triggerCode: "not-a-real-trigger",
        }),
      /triggerCode/,
    );
  });
});
