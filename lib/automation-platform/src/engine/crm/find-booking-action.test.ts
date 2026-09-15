import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DefaultBookingServicePort } from "../../ports/booking-service-port.js";
import { InMemoryBookingRepository } from "../../crm/booking-repository-port.js";
import { executeFindBookingAction } from "./find-booking-action.js";
import type { ExecutionContext } from "../execution-context.js";
import { variableBinding } from "../../field-binding/normalize.js";

function createContext(
  config: Record<string, unknown>,
  variables: Record<string, unknown> = {},
  extras: { channel?: ExecutionContext["session"]["channel"]; customerId?: string | null } = {},
): ExecutionContext {
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
      current_node_id: "node-1",
      variables,
      metadata: { actorUserId: "user-1" },
      error_message: null,
      started_at: new Date().toISOString(),
      finished_at: null,
    },
    session: {
      id: "session-1",
      company_id: "company-1",
      channel: extras.channel ?? "instagram",
      external_user_id: "igsid-1",
      customer_id: extras.customerId ?? null,
      flow_id: "flow-1",
      run_id: "run-1",
      current_node_id: "node-1",
      status: "running",
      started_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
      metadata: {},
      variables,
    },
    variables,
    customer: { id: extras.customerId ?? null },
    currentNode: {
      id: "node-1",
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

describe("executeFindBookingAction", () => {
  it("continues with not_found when Instagram has no phone and no customer", async () => {
    const bookingService = new DefaultBookingServicePort(new InMemoryBookingRepository());
    const context = createContext({
      lookupBy: "phone",
      value: variableBinding("{{whatsapp_sender_phone}}"),
    });
    const result = await executeFindBookingAction(context, context.currentNode.config, bookingService);

    assert.equal(result.outcome, "continue");
    assert.equal((result.variables?.lookup as { status?: string } | undefined)?.status, "not_found");
    assert.equal((result.variables?.booking as { exists?: boolean } | undefined)?.exists, false);
  });
});
