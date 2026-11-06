import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideMobileDeepLink } from "./deep-link";

const companyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherCompanyId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const session = { authenticated: true, sessionExpired: false, companyId };

describe("mobile deep links", () => {
  it("routes authenticated CRM, inbox, ticket, email, and notification targets", () => {
    const customer = decideMobileDeepLink({ ...session, url: `valueor://customer/${id}` });
    const lead = decideMobileDeepLink({ ...session, url: `valueor://lead/${id}` });
    const opportunity = decideMobileDeepLink({ ...session, url: `valueor://opportunity/${id}` });
    const conversation = decideMobileDeepLink({ ...session, url: `valueor://conversation/${id}` });
    const ticket = decideMobileDeepLink({ ...session, url: `valueor://ticket/${id}` });
    const email = decideMobileDeepLink({ ...session, url: `valueor://email/${id}` });
    const notification = decideMobileDeepLink({ ...session, payload: { resource: "notification", id, companyId } });
    assert.equal(customer.ok && customer.href, `/customer/${id}`);
    assert.equal(lead.ok && lead.href, `/lead/${id}`);
    assert.equal(opportunity.ok && opportunity.href, `/opportunity/${id}`);
    assert.equal(conversation.ok && conversation.href, `/conversation/${id}`);
    assert.equal(ticket.ok && ticket.href, `/ticket/${id}`);
    assert.equal(email.ok && email.href, `/conversation/${id}`);
    assert.equal(notification.ok && notification.href, "/notifications");
  });

  it("sends an expired or signed-out session to login and rejects another company", () => {
    const expired = decideMobileDeepLink({ url: `valueor://ticket/${id}`, authenticated: false, sessionExpired: true, companyId: null });
    const signedOut = decideMobileDeepLink({ url: `valueor://customer/${id}`, authenticated: false, sessionExpired: false, companyId: null });
    const foreign = decideMobileDeepLink({
      ...session,
      payload: { resource: "conversation", id, companyId: otherCompanyId },
    });
    const invalid = decideMobileDeepLink({ ...session, url: "valueor://customer/not-an-id" });
    assert.equal(expired.ok, false);
    if (!expired.ok) assert.equal(expired.reason, "session_expired");
    assert.equal(signedOut.ok, false);
    if (!signedOut.ok) assert.equal(signedOut.href, "/login");
    assert.equal(foreign.ok, false);
    if (!foreign.ok) assert.equal(foreign.reason, "cross_tenant");
    assert.equal(invalid.ok, false);
    if (!invalid.ok) assert.equal(invalid.href, "/(workspace)");
  });
});
