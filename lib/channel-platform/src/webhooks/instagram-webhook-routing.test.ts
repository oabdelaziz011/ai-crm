import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractInstagramBusinessAccountId,
  summarizeInstagramWebhookPayload,
} from "../adapters/instagram/instagram-api-client.js";
import { resolveInstagramWebhookCompanyChannelId } from "./instagram-webhook-routing.js";

function samplePayload(instagramBusinessAccountId: string, senderId = "17841400000000000") {
  return {
    object: "instagram",
    entry: [
      {
        id: instagramBusinessAccountId,
        time: 1710000000,
        messaging: [
          {
            sender: { id: senderId },
            recipient: { id: instagramBusinessAccountId },
            timestamp: 1710000000,
            message: {
              mid: "mid.test-message",
              text: "hello instagram",
            },
          },
        ],
      },
    ],
  };
}

describe("extractInstagramBusinessAccountId", () => {
  it("extracts business account id from entry.id", () => {
    assert.equal(
      extractInstagramBusinessAccountId(samplePayload("17841412345678901")),
      "17841412345678901",
    );
  });

  it("returns null when object is not instagram", () => {
    assert.equal(extractInstagramBusinessAccountId({ object: "page", entry: [] }), null);
  });
});

describe("summarizeInstagramWebhookPayload", () => {
  it("summarizes instagram webhook payload", () => {
    const summary = summarizeInstagramWebhookPayload(samplePayload("17841412345678901"));
    assert.equal(summary.object, "instagram");
    assert.equal(summary.entryCount, 1);
    assert.equal(summary.messagingCount, 1);
    assert.equal(summary.instagramBusinessAccountId, "17841412345678901");
  });
});

describe("resolveInstagramWebhookCompanyChannelId", () => {
  it("routes to the channel that matches instagram business account id", async () => {
    const result = await resolveInstagramWebhookCompanyChannelId({
      instagramBusinessAccountId: "17841412345678901",
      lookupByInstagramBusinessAccountId: async () => [
        { id: "channel-bound", companyId: "company-a" },
      ],
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.companyChannelId, "channel-bound");
      assert.equal(result.source, "instagram_business_account");
    }
  });

  it("falls back to URL channel id when business account is unknown", async () => {
    const result = await resolveInstagramWebhookCompanyChannelId({
      instagramBusinessAccountId: "99999999999999999",
      urlCompanyChannelId: "legacy-channel",
      lookupByInstagramBusinessAccountId: async () => [],
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.companyChannelId, "legacy-channel");
      assert.equal(result.source, "url_fallback");
    }
  });

  it("rejects duplicate instagram business account configuration", async () => {
    const result = await resolveInstagramWebhookCompanyChannelId({
      instagramBusinessAccountId: "17841412345678901",
      lookupByInstagramBusinessAccountId: async () => [
        { id: "channel-a", companyId: "company-a" },
        { id: "channel-b", companyId: "company-b" },
      ],
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "duplicate_instagram_business_account");
      assert.equal(result.matches.length, 2);
    }
  });

  it("returns no_channel when routing metadata is missing", async () => {
    const result = await resolveInstagramWebhookCompanyChannelId({
      instagramBusinessAccountId: null,
      lookupByInstagramBusinessAccountId: async () => [],
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "no_channel");
    }
  });
});
