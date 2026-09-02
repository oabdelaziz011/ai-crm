import assert from "node:assert/strict";
import { executeCreateCustomerAction } from "./create-customer-action.js";
import { InMemoryCustomerRepository } from "../../crm/customer/customer-repository-port.js";
import { DefaultCustomerServicePort } from "../../ports/customer-service-port.js";
import type { ConversationCustomerLinkPort } from "../../ports/conversation-customer-link-port.js";
import type { ExecutionContext } from "../execution-context.js";

function buildContext(variables: Record<string, unknown>): ExecutionContext {
  return {
    company: { id: "company-1" },
    flow: { id: "flow-1", company_id: "company-1", name: "Flow", status: "active" } as ExecutionContext["flow"],
    run: { id: "run-1", metadata: { actorUserId: "user-1" } } as ExecutionContext["run"],
    session: { id: "session-1", metadata: {} } as ExecutionContext["session"],
    variables,
    customer: { id: null },
    currentNode: { id: "node-create", type: "action", config: {} } as ExecutionContext["currentNode"],
    nodes: [],
    edges: [],
  };
}

const repository = new InMemoryCustomerRepository();
const customerService = new DefaultCustomerServicePort(repository);

const links: Array<Record<string, string>> = [];
const conversationCustomerLink: ConversationCustomerLinkPort = {
  async linkCustomerToConversation(input) {
    links.push({
      companyId: input.companyId,
      conversationId: input.conversationId,
      customerId: input.customerId,
      automationSessionId: input.automationSessionId ?? "",
    });
  },
};

const result = await executeCreateCustomerAction(
  buildContext({
    conversationId: "conv-inbox-1",
    customer_name: "Test again",
    customer_phone: "+201000000001",
    customer_age: "23",
    customer_gender: "male",
  }),
  {
    nameField: "customer_name",
    phoneField: "customer_phone",
    ageField: "customer_age",
    genderField: "customer_gender",
  },
  customerService,
  conversationCustomerLink,
);

assert.equal(result.output?.customerId, repository.list()[0]?.id);
assert.equal(links.length, 1);
assert.equal(links[0]?.conversationId, "conv-inbox-1");
assert.equal(links[0]?.customerId, repository.list()[0]?.id);
assert.equal(links[0]?.automationSessionId, "session-1");

const withoutConversation = await executeCreateCustomerAction(
  buildContext({ customer_name: "No Link" }),
  { nameField: "customer_name" },
  customerService,
  conversationCustomerLink,
);

assert.equal(withoutConversation.output?.customerId, repository.list()[1]?.id);
assert.equal(links.length, 1);

console.log("create-customer-action.test.ts: all assertions passed");
