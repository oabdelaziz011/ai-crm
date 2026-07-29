import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractEmailRecipientAddress, resolveEmailWebhookCompanyChannelId } from "./email-webhook-routing.js";

describe("email webhook routing", () => {
  it("extracts recipient from to array", () => {
    assert.equal(
      extractEmailRecipientAddress({ to: [{ email: "Support@Company.com" }] }),
      "support@company.com",
    );
  });

  it("routes by to email when url channel id is absent", async () => {
    const routing = await resolveEmailWebhookCompanyChannelId({
      toEmail: "support@company.com",
      lookupByToEmail: async () => [{ id: "cc-email", companyId: "co-1" }],
    });

    assert.equal(routing.ok, true);
    if (routing.ok) {
      assert.equal(routing.companyChannelId, "cc-email");
      assert.equal(routing.source, "to_email");
    }
  });
});
