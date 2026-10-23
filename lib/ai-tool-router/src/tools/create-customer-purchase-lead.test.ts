import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCreateCustomerTool } from "./create-customer-tool.js";
import type { ToolCustomerServicePort } from "./customer-service-port.js";
import type { ToolExecutionContext } from "./tool-contract.js";

function port(ensure: ToolCustomerServicePort["ensurePurchaseLead"]): ToolCustomerServicePort {
  return {
    async findCustomer() {
      return { status: "not_found", count: 0 };
    },
    async createCustomer(input) {
      return { customer: { id: "cust-1", name: input.name, email: input.email ?? null, phone: input.phone } };
    },
    ensurePurchaseLead: ensure,
  };
}

function context(texts: string[]): ToolExecutionContext {
  return {
    companyId: "company-a",
    conversationId: "conv-1",
    conversationState: "waiting_user",
    userId: "user-1",
    trustedConversationTexts: texts,
  };
}

describe("create_customer purchase lead", () => {
  it("creates a lead only for an explicit purchase and returns that lead id", async () => {
    const calls: string[] = [];
    const tool = createCreateCustomerTool(
      port(async () => {
        calls.push("ensure");
        return { leadId: "lead-1", created: true };
      }),
    );
    const bought = await tool.execute(context(["My name is Sara Buyer and I want to buy. Mobile 01053767770."]), {
      name: "Sara Buyer",
      phone: "+201053767770",
      region: "EG",
    });
    assert.equal(bought.success, true);
    assert.equal(bought.customerId, "cust-1");
    assert.equal(bought.leadId, "lead-1");
    assert.equal(calls.length, 1);

    const priced = await tool.execute(context(["How much is the Sprint Verify Widget?"]), {
      name: "Sara Buyer",
      phone: "+201053767771",
      region: "EG",
    });
    assert.equal(priced.success, true);
    assert.equal(priced.leadId, undefined);
    assert.equal(calls.length, 1);
  });
});
