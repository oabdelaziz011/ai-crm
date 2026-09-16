import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeCreateCustomerAction } from "./create-customer-action.js";
import { InMemoryCustomerRepository } from "../../crm/customer/customer-repository-port.js";
import { DefaultCustomerServicePort } from "../../ports/customer-service-port.js";
import type { ExecutionContext } from "../execution-context.js";

function buildContext(input: {
  variables: Record<string, unknown>;
  resumeInput?: Record<string, unknown>;
}): ExecutionContext {
  return {
    company: { id: "company-1" },
    flow: { id: "flow-1", company_id: "company-1", name: "Flow", status: "active" } as ExecutionContext["flow"],
    run: { id: "run-1", metadata: { actorUserId: "user-1" } } as ExecutionContext["run"],
    session: { id: "session-1", channel: "instagram", metadata: {} } as ExecutionContext["session"],
    variables: input.variables,
    customer: { id: null },
    currentNode: { id: "node-create", type: "action", config: {} } as ExecutionContext["currentNode"],
    nodes: [],
    edges: [],
    input: input.resumeInput,
  };
}

const customerConfig = {
  nameField: "customer_name",
  phoneField: "customer_phone",
  ageField: "customer_age",
  genderField: "customer_gender",
};

describe("create_customer local phone region", () => {
  it("asks for international format instead of failing the run", async () => {
    const repository = new InMemoryCustomerRepository();
    const customerService = new DefaultCustomerServicePort(repository);
    const result = await executeCreateCustomerAction(
      buildContext({
        variables: {
          conversation: { language: "ar" },
          customer_name: "Test User",
          customer_phone: "01012345678",
          customer_age: "28",
          customer_gender: "male",
        },
      }),
      customerConfig,
      customerService,
    );

    assert.equal(result.outcome, "waiting_input");
    assert.equal(result.variables?.__waitingFor, "customer_phone");
    assert.match(String(result.variables?.__prompt ?? ""), /الصيغة الدولية/);
    assert.equal(repository.list().length, 0);
    const queue = result.variables?.__outboundQueue as Array<{ text?: string }>;
    assert.equal(queue?.at(-1)?.text, result.variables?.__prompt);
  });

  it("creates the customer after the user sends an E.164 number", async () => {
    const repository = new InMemoryCustomerRepository();
    const customerService = new DefaultCustomerServicePort(repository);
    const result = await executeCreateCustomerAction(
      buildContext({
        variables: {
          conversation: { language: "ar" },
          customer_name: "Test User",
          customer_phone: "01012345678",
          customer_age: "28",
          customer_gender: "male",
        },
        resumeInput: { customer_phone: "+201012345678" },
      }),
      customerConfig,
      customerService,
    );

    assert.equal(result.outcome, "continue");
    assert.equal(repository.list().length, 1);
    assert.equal(result.variables?.__waitingFor, null);
    assert.equal(result.variables?.customer_phone, repository.list()[0]?.phone);
  });

  it("still creates immediately when the stored phone is already E.164", async () => {
    const repository = new InMemoryCustomerRepository();
    const customerService = new DefaultCustomerServicePort(repository);
    const result = await executeCreateCustomerAction(
      buildContext({
        variables: {
          customer_name: "WhatsApp User",
          customer_phone: "+201000000001",
          customer_age: "23",
          customer_gender: "male",
        },
      }),
      customerConfig,
      customerService,
    );

    assert.equal(result.outcome, "continue");
    assert.equal(repository.list().length, 1);
  });
});
