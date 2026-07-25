import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DefaultCustomerServicePort } from "../../ports/customer-service-port.js";
import type { CustomerServicePort } from "../../ports/customer-service-port.js";
import { InMemoryCustomerRepository } from "../../crm/customer/customer-repository-port.js";
import { executeFindCustomerAction } from "./find-customer-action.js";
import type { ExecutionContext } from "../execution-context.js";
import { staticBinding, variableBinding } from "../../field-binding/normalize.js";

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
      channel: "whatsapp",
      external_user_id: "ext-1",
      customer_id: "cust-session",
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
    customer: { id: "cust-session" },
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

describe("executeFindCustomerAction", () => {
  it("returns found business outcome with lookup and customer variables", async () => {
    const repository = new InMemoryCustomerRepository();
    repository.seed({
      id: "cust-1",
      name: "Omar",
      email: "omar@example.com",
      phone: "+15550001",
      age: 32,
      gender: "Male",
      notes: "VIP",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    });
    const customerService = new DefaultCustomerServicePort(repository);

    const result = await executeFindCustomerAction(
      createContext(
        {
          action: "find_customer",
          lookupBy: "phone",
          value: variableBinding("phone"),
        },
        { phone: "+15550001" },
      ),
      {
        action: "find_customer",
        lookupBy: "phone",
        value: variableBinding("phone"),
      },
      customerService,
    );

    assert.equal(result.outcome, "continue");
    assert.deepEqual(result.variables?.lookup, { status: "found", count: 1 });
    assert.notEqual(Object.prototype.hasOwnProperty.call(result.variables?.lookup, "found"), true);
    assert.equal((result.variables?.customer as { exists: boolean }).exists, true);
    assert.equal((result.variables?.customer as { id: string }).id, "cust-1");
    assert.equal((result.variables?.customer as { age: number }).age, 32);
    assert.equal((result.variables?.customer as { gender: string }).gender, "Male");
  });

  it("returns not_found business outcome with cleared customer variables", async () => {
    const customerService = new DefaultCustomerServicePort(new InMemoryCustomerRepository());

    const result = await executeFindCustomerAction(
      createContext(
        {
          action: "find_customer",
          lookupBy: "email",
          value: staticBinding("missing@example.com"),
        },
        { customer: { id: "old", name: "Old" } },
      ),
      {
        action: "find_customer",
        lookupBy: "email",
        value: staticBinding("missing@example.com"),
      },
      customerService,
    );

    assert.equal(result.outcome, "continue");
    assert.deepEqual(result.variables?.lookup, { status: "not_found", count: 0 });
    assert.equal((result.variables?.customer as { exists: boolean }).exists, false);
    assert.equal((result.variables?.customer as { id: null }).id, null);
  });

  it("returns duplicate business outcome without selecting a customer", async () => {
    const repository = new InMemoryCustomerRepository();
    repository.seed({
      id: "cust-1",
      name: "Omar",
      email: "omar@example.com",
      phone: "+15550001",
      notes: null,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    });
    repository.seed({
      id: "cust-2",
      name: "Omar Duplicate",
      email: "dup@example.com",
      phone: "+15550001",
      notes: null,
      createdAt: "2026-07-02T00:00:00.000Z",
      updatedAt: "2026-07-02T00:00:00.000Z",
    });
    const customerService = new DefaultCustomerServicePort(repository);

    const result = await executeFindCustomerAction(
      createContext({
        action: "find_customer",
        lookupBy: "phone",
        value: staticBinding("+15550001"),
      }),
      {
        action: "find_customer",
        lookupBy: "phone",
        value: staticBinding("+15550001"),
      },
      customerService,
    );

    assert.equal(result.outcome, "continue");
    assert.deepEqual(result.variables?.lookup, { status: "duplicate", count: 2 });
    assert.equal((result.variables?.customer as { exists: boolean }).exists, false);
    assert.equal((result.variables?.customer as { id: null }).id, null);
  });

  it("keeps lookup.status aligned with service status when count alone is ambiguous", async () => {
    const customerService: CustomerServicePort = {
      async findCustomer() {
        return { status: "duplicate", count: 1 };
      },
    };

    const result = await executeFindCustomerAction(
      createContext({
        action: "find_customer",
        lookupBy: "phone",
        value: staticBinding("+15550001"),
      }),
      {
        action: "find_customer",
        lookupBy: "phone",
        value: staticBinding("+15550001"),
      },
      customerService,
    );

    assert.equal(result.outcome, "continue");
    assert.deepEqual(result.variables?.lookup, { status: "duplicate", count: 1 });
    assert.equal((result.variables?.customer as { exists: boolean }).exists, false);
  });
});
