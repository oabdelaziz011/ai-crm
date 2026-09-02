import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCreateCustomerTool } from "./create-customer-tool.js";

describe("createCreateCustomerTool — D5.1 global phone", () => {
  it("creates a customer when E.164 phone is unique", async () => {
    const created: Array<Record<string, unknown>> = [];
    const tool = createCreateCustomerTool({
      async findCustomer() {
        return { status: "not_found", count: 0 };
      },
      async createCustomer(input) {
        created.push(input as unknown as Record<string, unknown>);
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
      { name: "Ahmed Mohamed", phone: "+201012345678", email: "ahmed@example.com" },
    );

    assert.equal(output.success, true);
    assert.equal(output.customerId, "cust-1");
    assert.equal(created.length, 1);
    assert.equal((created[0]?.phoneIdentity as { phone_e164?: string })?.phone_e164, "+201012345678");
  });

  it("creates Saudi E.164 without EG assumption", async () => {
    const created: Array<Record<string, unknown>> = [];
    const tool = createCreateCustomerTool({
      async findCustomer() {
        return { status: "not_found", count: 0 };
      },
      async createCustomer(input) {
        created.push(input as unknown as Record<string, unknown>);
        return {
          customer: {
            id: "cust-sa",
            name: input.name,
            email: null,
            phone: input.phone,
          },
        };
      },
    });

    const output = await tool.execute(
      { companyId: "company-1", conversationId: "conv-1", conversationState: "waiting_user", userId: "user-1" },
      { name: "Sara Ali", phone: "+966551234567" },
    );
    assert.equal(output.success, true);
    assert.equal((created[0]?.phoneIdentity as { phone_country_iso?: string })?.phone_country_iso, "SA");
  });

  it("local national without region fails closed (never invents EG)", async () => {
    const tool = createCreateCustomerTool({
      async findCustomer() {
        return { status: "not_found", count: 0 };
      },
      async createCustomer() {
        throw new Error("Should not create.");
      },
    });

    const output = await tool.execute(
      { companyId: "company-1", conversationId: "conv-1", conversationState: "waiting_user", userId: "user-1" },
      { name: "Ahmed Mohamed", phone: "01012345678" },
    );
    assert.equal(output.success, false);
    assert.equal(output.errorCode, "PHONE_REGION_REQUIRED");
  });

  it("local national with explicit region resolves", async () => {
    const created: Array<Record<string, unknown>> = [];
    const tool = createCreateCustomerTool({
      async findCustomer() {
        return { status: "not_found", count: 0 };
      },
      async createCustomer(input) {
        created.push(input as unknown as Record<string, unknown>);
        return {
          customer: {
            id: "cust-eg",
            name: input.name,
            email: null,
            phone: input.phone,
          },
        };
      },
    });

    const output = await tool.execute(
      { companyId: "company-1", conversationId: "conv-1", conversationState: "waiting_user", userId: "user-1" },
      { name: "Ahmed Mohamed", phone: "01012345678", region: "EG" },
    );
    assert.equal(output.success, true);
    assert.equal((created[0]?.phoneIdentity as { phone_e164?: string })?.phone_e164, "+201012345678");
    assert.equal(created[0]?.phone, "01012345678");
  });

  it("returns existing customer id when phone already exists", async () => {
    const tool = createCreateCustomerTool({
      async findCustomer() {
        return {
          status: "found",
          count: 1,
          customer: { id: "existing-1", name: "Existing", email: null, phone: "201012345678" },
        };
      },
      async createCustomer() {
        throw new Error("Should not create when duplicate exists.");
      },
    });

    const output = await tool.execute(
      { companyId: "company-1", conversationId: "conv-1", conversationState: "waiting_user", userId: "user-1" },
      { name: "Ahmed Mohamed", phone: "201012345678" },
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
        updates.push(input as unknown as Record<string, unknown>);
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
      /دولية|غير صالح|region|E\.164|ISO/i,
    );
  });

  it("accepts Arabic-Indic international digits", async () => {
    const tool = createCreateCustomerTool({
      async findCustomer() {
        return {
          status: "found",
          count: 1,
          customer: { id: "existing-1", name: "عمر مجدي", email: null, phone: "201012345678" },
        };
      },
      async createCustomer() {
        throw new Error("Should not create when duplicate exists.");
      },
    });

    const output = await tool.execute(
      { companyId: "company-1", conversationId: "conv-1", conversationState: "waiting_user", userId: "user-1" },
      { name: "عمر مجدي", phone: "٢٠١٠١٢٣٤٥٦٧٨" },
    );

    assert.equal(output.success, true);
    assert.equal(output.existing, true);
    assert.match(String(output.customerGreeting), /عمر مجدي/);
  });

  it("rejects first-name-only Arabic name and asks for full name", async () => {
    const tool = createCreateCustomerTool({
      async findCustomer() {
        throw new Error("should not lookup");
      },
      async createCustomer() {
        throw new Error("should not create");
      },
    });
    const output = await tool.execute(
      { companyId: "company-1", conversationId: "conv-1", conversationState: "waiting_user", userId: "user-1" },
      { name: "عمر", phone: "+201011404109" },
    );
    assert.equal(output.success, false);
    assert.equal(output.errorCode, "INCOMPLETE_FULL_NAME");
    assert.match(String(output.customerFacingMessage ?? ""), /الاسم الكامل/);
  });

  it("rejects CRM phone that does not match the WhatsApp sender (isolation)", async () => {
    const tool = createCreateCustomerTool({
      async findCustomer() {
        throw new Error("should not lookup on mismatch");
      },
      async createCustomer() {
        throw new Error("should not create on mismatch");
      },
      async getConversationWhatsAppSender() {
        return "201099988877";
      },
    });
    const output = await tool.execute(
      { companyId: "company-1", conversationId: "conv-1", conversationState: "waiting_user", userId: "user-1" },
      { name: "عميل تجريبي", phone: "01011404300" },
    );
    assert.equal(output.success, false);
    assert.equal(output.errorCode, "PHONE_SENDER_MISMATCH");
  });

  it("WhatsApp create uses channel sender E.164 (not EG hardcode)", async () => {
    const created: Array<Record<string, unknown>> = [];
    const links: Array<Record<string, unknown>> = [];
    const tool = createCreateCustomerTool({
      async findCustomer() {
        return { status: "not_found", count: 0 };
      },
      async createCustomer(input) {
        created.push(input as unknown as Record<string, unknown>);
        return {
          customer: {
            id: "cust-new-1",
            name: input.name,
            email: null,
            phone: input.phone,
          },
        };
      },
      async getConversationWhatsAppSender() {
        return "201012345678";
      },
      async linkConversationCustomer(input) {
        links.push(input as unknown as Record<string, unknown>);
      },
    });

    const output = await tool.execute(
      { companyId: "company-1", conversationId: "conv-1", conversationState: "waiting_user", userId: "user-1" },
      { name: "عميل تجريبي", phone: "01012345678" },
    );

    assert.equal(output.success, true);
    assert.equal(output.customerId, "cust-new-1");
    assert.equal((created[0]?.phoneIdentity as { phone_e164?: string })?.phone_e164, "+201012345678");
    assert.equal((created[0]?.phoneIdentity as { phone_region_source?: string })?.phone_region_source, "channel");
    assert.equal(created[0]?.phone, "01012345678");
    assert.equal(links[0]?.stampTrustedIdentity, true);
  });
});
