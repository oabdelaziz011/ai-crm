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

  it("returns existing customer id when phone already exists", async () => {
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

    assert.equal(output.success, true);
    assert.equal(output.customerId, "existing-1");
    assert.equal(output.existing, true);
  });

  it("preserves the existing CRM name when the same phone sends a different conversational name", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const tool = createCreateCustomerTool({
      async findCustomer() {
        return {
          status: "found",
          count: 1,
          customer: { id: "existing-1", name: "نسمة حسام الدين", email: null, phone: "201023169075" },
        };
      },
      async createCustomer() {
        throw new Error("Should not create when duplicate exists.");
      },
      async updateCustomerName(input) {
        updates.push(input);
        throw new Error("Should not update CRM name during normal booking intake.");
      },
    });

    const output = await tool.execute(
      { companyId: "company-1", conversationId: "conv-1", conversationState: "waiting_user", userId: "user-1" },
      { name: "مروة محي", phone: "201023169075" },
    );

    assert.equal(output.success, true);
    assert.equal(output.customerId, "existing-1");
    assert.equal(output.customerName, "نسمة حسام الدين");
    assert.deepEqual(updates, []);
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
      /غير مكتمل|11 رقم/,
    );
  });

  it("accepts Arabic-Indic phone digits and returns existing customer greeting", async () => {
    const tool = createCreateCustomerTool({
      async findCustomer() {
        return {
          status: "found",
          count: 1,
          customer: { id: "existing-1", name: "عمر مجدي", email: null, phone: "01012345678" },
        };
      },
      async createCustomer() {
        throw new Error("Should not create when duplicate exists.");
      },
    });

    const output = await tool.execute(
      { companyId: "company-1", conversationId: "conv-1", conversationState: "waiting_user", userId: "user-1" },
      { name: "عمر مجدي", phone: "٠١٠١٢٣٤٥٦٧٨" },
    );

    assert.equal(output.success, true);
    assert.equal(output.existing, true);
    assert.match(String(output.customerGreeting), /عمر مجدي/);
  });
});
