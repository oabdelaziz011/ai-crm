import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MobileActor, MobileRecordPorts } from "./mobile-record-executor.js";
import { runMobileRecord } from "./mobile-record-executor.js";

const actor: MobileActor = {
  userId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  companyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  isSuperAdmin: false,
  permissions: [],
};

function ports(overrides: Partial<MobileRecordPorts> = {}): MobileRecordPorts & { calls: unknown[] } {
  const calls: unknown[] = [];
  const record = async (...args: unknown[]) => {
    calls.push(args);
  };
  const base: MobileRecordPorts = {
    async createCustomer(next) { calls.push(["customer", next.companyId]); return { id: "1" }; },
    async updateCustomer(...args) { await record(...args); },
    async createLead(next, title) { calls.push(["lead", next.companyId, title]); return { id: "2" }; },
    async updateLead(...args) { await record(...args); },
    async createOpportunity(next, name, currency) { calls.push(["opportunity", next.companyId, name, currency]); return { id: "3" }; },
    async updateOpportunity(...args) { await record(...args); },
    async changeTicketStatus(...args) { await record(...args); },
    async changeTicketPriority(...args) { await record(...args); },
    async assignTicket(...args) { await record(...args); },
    async addTicketComment(...args) { await record("comment", ...args); },
    async assignConversation(...args) { await record(...args); },
    async updateConversationState(...args) { await record(...args); },
    async markConversationRead(...args) { await record(...args); },
    async markConversationUnread(...args) { await record(...args); return { unreadCountEmployee: 1 }; },
    async prepareConversationSend(next, id, text) { calls.push(["prepare", next.companyId, id, text]); return { companyChannelId: "channel-1", text }; },
    async markNotificationRead(...args) { await record(...args); },
    async markAllNotificationsRead(next) { calls.push(["read-all", next.companyId, next.userId]); },
    async createBranch(...args) { await record(...args); return { id: "4" }; },
    async updateBranch(...args) { await record(...args); },
    async saveBranchHours(...args) { await record(...args); },
    async updateRole(...args) { await record(...args); },
    async saveEmailDraft(...args) { await record("draft", ...args); },
  };
  return { ...base, ...overrides, calls };
}

describe("mobile record execution", () => {
  it("creates a lead with the session company id", async () => {
    const fake = ports();
    const result = await runMobileRecord(actor, { type: "lead.create", title: "Inbound", email: null, phone: null }, fake);
    assert.equal(result.ok, true);
    assert.deepEqual(fake.calls[0], ["lead", actor.companyId, "Inbound"]);
  });

  it("marks a note internal and a reply public", async () => {
    const fake = ports();
    await runMobileRecord(actor, { type: "ticket.note", id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", body: "Private" }, fake);
    await runMobileRecord(actor, { type: "ticket.reply", id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", body: "Hello" }, fake);
    assert.equal((fake.calls[0] as unknown[])[4], true);
    assert.equal((fake.calls[1] as unknown[])[4], false);
  });

  it("prepares outbound delivery without sending it", async () => {
    const fake = ports();
    const result = await runMobileRecord(actor, {
      type: "conversation.send",
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      text: "Hello",
    }, fake);
    assert.equal(result.sent, false);
    const delivery = result.delivery as { path: string; body: { companyId: string } };
    assert.equal(delivery.path, "/api/omnichannel/outbound/dispatch");
    assert.equal(delivery.body.companyId, actor.companyId);
  });

  it("returns the employee unread count from the conversation service", async () => {
    const fake = ports();
    const result = await runMobileRecord(actor, {
      type: "conversation.unread",
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    }, fake);
    assert.equal(result.ok, true);
    assert.equal(result.unreadCountEmployee, 1);
    assert.equal((fake.calls[0] as unknown[])[0], actor);
  });

  it("persists a valid assignment when the service accepts it", async () => {
    const fake = ports();
    const result = await runMobileRecord(actor, {
      type: "ticket.assign",
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      assignedUserId: actor.userId,
    }, fake);
    assert.equal(result.ok, true);
    assert.equal((fake.calls[0] as unknown[])[2], actor.userId);
  });

  it("saves an email draft without sending it", async () => {
    const fake = ports();
    const result = await runMobileRecord(actor, {
      type: "email.draft",
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      subject: "Hello",
      body: "Draft",
      mode: "reply",
    }, fake);
    assert.equal(result.sent, false);
    assert.equal((fake.calls[0] as unknown[])[0], "draft");
  });
});
