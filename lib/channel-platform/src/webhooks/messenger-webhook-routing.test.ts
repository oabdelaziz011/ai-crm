import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractMessengerPageId } from "../adapters/messenger/messenger-api-client.js";
import { summarizeMessengerWebhookPayload } from "../adapters/messenger/messenger-api-client.js";
import { resolveMessengerWebhookCompanyChannelId } from "./messenger-webhook-routing.js";

function samplePayload(pageId: string, senderId = "1234567890") {
  return {
    object: "page",
    entry: [
      {
        id: pageId,
        time: 1710000000,
        messaging: [
          {
            sender: { id: senderId },
            recipient: { id: pageId },
            timestamp: 1710000000,
            message: {
              mid: "mid.messenger-test",
              text: "hello messenger",
            },
          },
        ],
      },
    ],
  };
}

describe("extractMessengerPageId", () => {
  it("extracts page id from entry.id", () => {
    assert.equal(extractMessengerPageId(samplePayload("112233445566778")), "112233445566778");
  });

  it("returns null when object is not page", () => {
    assert.equal(extractMessengerPageId({ object: "instagram", entry: [] }), null);
  });
});

describe("summarizeMessengerWebhookPayload", () => {
  it("summarizes messenger webhook payload", () => {
    const summary = summarizeMessengerWebhookPayload(samplePayload("112233445566778"));
    assert.equal(summary.object, "page");
    assert.equal(summary.pageId, "112233445566778");
    assert.equal(summary.messagingCount, 1);
  });
});

describe("resolveMessengerWebhookCompanyChannelId", () => {
  it("routes to the channel that matches page id", async () => {
    const result = await resolveMessengerWebhookCompanyChannelId({
      pageId: "112233445566778",
      lookupByPageId: async () => [{ id: "channel-bound", companyId: "company-a" }],
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.companyChannelId, "channel-bound");
      assert.equal(result.source, "page_id");
    }
  });

  it("rejects duplicate page id configuration", async () => {
    const result = await resolveMessengerWebhookCompanyChannelId({
      pageId: "112233445566778",
      lookupByPageId: async () => [
        { id: "channel-a", companyId: "company-a" },
        { id: "channel-b", companyId: "company-b" },
      ],
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "duplicate_page_id");
    }
  });
});
