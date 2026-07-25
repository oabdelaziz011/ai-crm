import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractWhatsAppPhoneNumberId,
  resolveWhatsAppWebhookCompanyChannelId,
} from "./whatsapp-webhook-routing.js";

function samplePayload(phoneNumberId: string) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: phoneNumberId },
              messages: [
                {
                  from: "15551234567",
                  id: "wamid.test",
                  timestamp: "1710000000",
                  type: "text",
                  text: { body: "hello" },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe("extractWhatsAppPhoneNumberId", () => {
  it("extracts phone_number_id from Meta payload", () => {
    assert.equal(extractWhatsAppPhoneNumberId(samplePayload("1168042419733416")), "1168042419733416");
  });

  it("returns null when metadata is missing", () => {
    assert.equal(extractWhatsAppPhoneNumberId({ object: "whatsapp_business_account", entry: [] }), null);
  });
});

describe("resolveWhatsAppWebhookCompanyChannelId", () => {
  it("routes to the channel that matches phone number", async () => {
    const result = await resolveWhatsAppWebhookCompanyChannelId({
      phoneNumberId: "1168042419733416",
      lookupByPhoneNumberId: async () => [{ id: "channel-bound", companyId: "company-a" }],
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.companyChannelId, "channel-bound");
      assert.equal(result.source, "phone_number");
    }
  });

  it("falls back to URL channel id when phone number is unknown", async () => {
    const result = await resolveWhatsAppWebhookCompanyChannelId({
      phoneNumberId: "999999999999999",
      urlCompanyChannelId: "legacy-channel",
      lookupByPhoneNumberId: async () => [],
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.companyChannelId, "legacy-channel");
      assert.equal(result.source, "url_fallback");
    }
  });

  it("rejects duplicate phone number configuration", async () => {
    const result = await resolveWhatsAppWebhookCompanyChannelId({
      phoneNumberId: "1168042419733416",
      urlCompanyChannelId: "legacy-channel",
      lookupByPhoneNumberId: async () => [
        { id: "channel-a", companyId: "company-a" },
        { id: "channel-b", companyId: "company-b" },
      ],
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "duplicate_phone_number");
      assert.equal(result.phoneNumberId, "1168042419733416");
      assert.equal(result.matches.length, 2);
    }
  });

  it("returns no_channel when phone is unknown and no URL fallback exists", async () => {
    const result = await resolveWhatsAppWebhookCompanyChannelId({
      phoneNumberId: "1168042419733416",
      lookupByPhoneNumberId: async () => [],
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "no_channel");
    }
  });

  it("routes via credential probe when configured phone number id is stale", async () => {
    let reconciled = false;
    const result = await resolveWhatsAppWebhookCompanyChannelId({
      phoneNumberId: "1214681355059951",
      lookupByPhoneNumberId: async () => [],
      lookupByCredentialProbe: async () => ({
        id: "channel-bound",
        companyId: "company-a",
      }),
      onPhoneNumberIdReconciled: async () => {
        reconciled = true;
      },
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.companyChannelId, "channel-bound");
      assert.equal(result.source, "credential_probe");
    }
    assert.equal(reconciled, true);
  });
});
