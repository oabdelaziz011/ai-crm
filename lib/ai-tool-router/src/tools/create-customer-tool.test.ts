import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCreateCustomerTool } from "./create-customer-tool.js";

describe("createCreateCustomerTool", () => {
  it("creates a customer when phone is unique", async () => {
    const created: Array<Record<string, unknown>> = [];
    const tool = createCreateCustomerTool({
      async findCustomer() {
        return { status: "not_found", count: 0 };
      },
      async createCustomer(input) {
        created.push(input);
        return {
          customer: {
            id: "cust-1",
            name: input.name,
            email: input.email ?? null,
            phone: input.phone,
          },
        };
      },
    });

    const output = await tool.execute(
      { companyId: "company-1", conversationId: "conv-1", conversationState: "waiting_user", userId: "user-1" },
      { name: "Ahmed Mohamed", phone: "01012345678", email: "ahmed@example.com" },
    );

    assert.equal(output.success, true);
    assert.equal(output.customerId, "cust-1");
    assert.equal(created.length, 1);
  });

  it("returns duplicate error when phone already exists", async () => {
    const tool = createCreateCustomerTool({
      async findCustomer() {
        return {
          status: "found",
          count: 1,
          customer: { id: "existing-1", name: "Existing", email: null, phone: "01012345678" },
        };
      },
      async createCustomer() {
        throw new Error("Should not create when duplicate exists.");
      },
    });

    const output = await tool.execute(
      { companyId: "company-1", conversationId: "conv-1", conversationState: "waiting_user", userId: "user-1" },
      { name: "Ahmed Mohamed", phone: "01012345678" },
    );

    assert.equal(output.success, false);
    assert.equal(output.errorCode, "DUPLICATE_CUSTOMER");
    assert.equal(output.customerId, "existing-1");
  });

  it("rejects invalid phone numbers", () => {
    const tool = createCreateCustomerTool({
      async findCustomer() {
        return { status: "not_found", count: 0 };
      },
      async createCustomer() {
        throw new Error("Should not be called.");
      },
    });

    assert.throws(
      () => tool.validate({ name: "Ahmed", phone: "123" }),
      /7 to 15 digits/,
    );
  });
});
