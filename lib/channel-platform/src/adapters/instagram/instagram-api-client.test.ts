import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InstagramApiClient } from "./instagram-api-client.js";
import { instagramMessagesUrl } from "./instagram-config.js";

const config = {
  instagramBusinessAccountId: "17841400000000000",
  accessToken: "ig_user_access_token_test_value",
  verifyToken: "verify-test",
  apiVersion: "v21.0",
};

describe("InstagramApiClient Send API host", () => {
  it("POSTs to graph.instagram.com/{IG_ID}/messages, not Facebook Graph or a Page path", async () => {
    const urls: string[] = [];
    const methods: string[] = [];

    const client = new InstagramApiClient({
      fetchFn: async (input, init) => {
        urls.push(String(input));
        methods.push(String(init?.method ?? "GET"));
        return new Response(JSON.stringify({ recipient_id: "igsid-1", message_id: "mid-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    await client.sendMessage(config, {
      recipient: { id: "igsid-1" },
      message: { text: "hello" },
    });

    assert.equal(urls.length, 1);
    assert.equal(urls[0], instagramMessagesUrl(config));
    assert.equal(methods[0], "POST");
    assert.match(urls[0] ?? "", /^https:\/\/graph\.instagram\.com\/v21\.0\/17841400000000000\/messages$/);
    assert.doesNotMatch(urls[0] ?? "", /graph\.facebook\.com/);
    assert.doesNotMatch(urls[0] ?? "", /\/me\/messages/);
    assert.doesNotMatch(urls[0] ?? "", /\/pages\//);
  });
});
