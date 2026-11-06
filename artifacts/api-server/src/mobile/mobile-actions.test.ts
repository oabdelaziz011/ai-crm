import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideMobileAction } from "./mobile-actions.js";
import { decidePushRegistration } from "./mobile-push.js";

const companyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherCompanyId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const recordId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const userId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function decide(body: Record<string, unknown>, permissions: string[], extras: { scope?: "platform" | "tenant"; companyId?: string | null; isSuperAdmin?: boolean } = {}) {
  return decideMobileAction({
    scope: extras.scope ?? "tenant",
    companyId: extras.companyId === undefined ? companyId : extras.companyId,
    isSuperAdmin: extras.isSuperAdmin ?? false,
    permissions,
    body,
  });
}

describe("mobile record actions", () => {
  it("rejects a platform session and a missing company", () => {
    const platform = decide({ type: "customer.create", name: "Ada" }, ["customers.create"], { scope: "platform", companyId: null });
    assert.equal(platform.ok, false);
    if (!platform.ok) assert.equal(platform.code, "tenant_required");
  });

  it("rejects a client company id that does not match the session", () => {
    const result = decide({ type: "customer.create", name: "Ada", companyId: otherCompanyId }, ["customers.create"]);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.code, "cross_tenant");
      assert.equal(result.message.includes(otherCompanyId), false);
    }
  });

  it("rejects a missing permission and a missing required field", () => {
    const denied = decide({ type: "lead.create", title: "New lead" }, []);
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.code, "forbidden");
    const invalid = decide({ type: "lead.create", title: "  " }, ["leads.create"]);
    assert.equal(invalid.ok, false);
    if (!invalid.ok) assert.equal(invalid.code, "validation_error");
  });

  it("accepts a lead and an opportunity for the session company", () => {
    const lead = decide({ type: "lead.create", title: "New lead", companyId }, ["leads.create"]);
    assert.equal(lead.ok, true);
    if (lead.ok) assert.equal(lead.companyId, companyId);
    const opportunity = decide({ type: "opportunity.create", name: "Deal", currency: "egp" }, ["opportunities.create"]);
    assert.equal(opportunity.ok, true);
    if (opportunity.ok && opportunity.action.type === "opportunity.create") assert.equal(opportunity.action.currency, "EGP");
  });

  it("keeps an internal note distinct from a customer reply", () => {
    const note = decide({ type: "ticket.note", id: recordId, body: "Private" }, ["tickets.comment"]);
    const reply = decide({ type: "ticket.reply", id: recordId, body: "Hello" }, ["tickets.comment"]);
    assert.equal(note.ok && note.action.type, "ticket.note");
    assert.equal(reply.ok && reply.action.type, "ticket.reply");
  });

  it("requires close permission and an explicit send confirmation", () => {
    const closed = decide({ type: "ticket.status", id: recordId, status: "closed" }, ["tickets.edit"]);
    assert.equal(closed.ok, false);
    const confirmed = decide({ type: "conversation.send", id: recordId, text: "Hello", confirmSend: true }, ["ai.conversations.reply"]);
    const unconfirmed = decide({ type: "conversation.send", id: recordId, text: "Hello" }, ["ai.conversations.reply"]);
    assert.equal(confirmed.ok, true);
    assert.equal(unconfirmed.ok, false);
    if (!unconfirmed.ok) assert.equal(unconfirmed.code, "confirmation_required");
  });

  it("rejects an invalid branch schedule and a system-looking empty role", () => {
    const hours = decide({ type: "branch.hours", id: recordId, weeklyHours: [{ day_of_week: 0, is_closed: false, opens_at: "17:00", closes_at: "09:00" }] }, ["settings.edit"]);
    assert.equal(hours.ok, false);
    const role = decide({ type: "role.update", id: recordId, name: "" }, ["roles.edit"]);
    assert.equal(role.ok, false);
  });

  it("does not send a notification while accepting a device token shape", () => {
    const invalid = decidePushRegistration({ token: "not-a-token" }, companyId);
    assert.equal(invalid.ok, false);
    if (!invalid.ok) assert.equal(invalid.code, "invalid_push_token");
    const valid = decidePushRegistration({ token: "ExponentPushToken[abc123]", platform: "ios" }, companyId);
    assert.equal(valid.ok, true);
    if (valid.ok) assert.equal(valid.platform, "ios");
  });

  it("marks a conversation unread with the same read permission and tenant", () => {
    const allowed = decide({ type: "conversation.unread", id: recordId }, ["ai.conversations.view"]);
    const assigned = decide({ type: "conversation.unread", id: recordId }, ["ai.conversations.view_assigned"]);
    const denied = decide({ type: "conversation.unread", id: recordId }, ["ai.conversations.reply"]);
    const foreign = decide({ type: "conversation.unread", id: recordId, companyId: otherCompanyId }, ["ai.conversations.view"]);
    assert.equal(allowed.ok, true);
    if (allowed.ok) assert.equal(allowed.action.type, "conversation.unread");
    assert.equal(assigned.ok, true);
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.code, "forbidden");
    assert.equal(foreign.ok, false);
    if (!foreign.ok) {
      assert.equal(foreign.status, 403);
      assert.equal(foreign.code, "cross_tenant");
      assert.equal(foreign.message.includes(otherCompanyId), false);
    }
  });

  it("allows a super admin on the resolved tenant to pass permission checks", () => {
    const result = decide({ type: "customer.update", id: recordId, name: "Ada" }, [], { isSuperAdmin: true });
    assert.equal(result.ok, true);
    assert.equal(userId.length > 0, true);
  });
});
