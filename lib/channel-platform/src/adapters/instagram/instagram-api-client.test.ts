import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InstagramApiClient, rewriteInstagramMessagesHost } from "./instagram-api-client.js";
import { instagramMessagesUrl } from "./instagram-config.js";

const config = {
  instagramBusinessAccountId: "17841435877386136",
  accessToken: "IGAA-login-token",
  verifyToken: "verify",
  apiVersion: "v21.0",
};

describe("InstagramApiClient sendMessage", () => {
  it("sends on graph.instagram.com with Bearer and access_token query", async () => {
    const requests: Array<{ url: string; authorization: string | null }> = [];
    const client = new InstagramApiClient({
      fetchFn: async (url, init) => {
        const headers = new Headers(init?.headers);
        requests.push({ url: String(url), authorization: headers.get("authorization") });
        return {
          ok: true,
          status: 200,
          json: async () => ({ message_id: "mid.1" }),
        } as Response;
      },
    });

    const result = await client.sendMessage(config, {
      recipient: { id: "28312734118386048" },
      message: { text: "ما هو اسمك؟" },
    });

    assert.equal(result.message_id, "mid.1");
    assert.equal(requests.length, 1);
    const sent = new URL(requests[0]!.url);
    assert.equal(sent.origin, "https://graph.instagram.com");
    assert.equal(sent.pathname, "/v21.0/17841435877386136/messages");
    assert.equal(sent.searchParams.get("access_token"), "IGAA-login-token");
    assert.equal(requests[0]?.authorization, "Bearer IGAA-login-token");
    assert.equal(instagramMessagesUrl(config).includes("access_token"), false);
  });

  it("retries once when Meta returns 190 cannot parse access token", async () => {
    const urls: string[] = [];
    const client = new InstagramApiClient({
      fetchFn: async (url) => {
        urls.push(String(url));
        if (urls.length === 1) {
          return {
            ok: false,
            status: 400,
            json: async () => ({
              error: { code: 190, message: "Invalid OAuth access token - Cannot parse access token" },
            }),
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ message_id: "mid.retry" }),
        } as Response;
      },
    });

    const result = await client.sendMessage(config, {
      recipient: { id: "igsid" },
      message: { text: "hello" },
    });

    assert.equal(result.message_id, "mid.retry");
    assert.equal(urls.length, 2);
    assert.match(urls[0]!, /graph\.instagram\.com/);
    assert.match(urls[1]!, /graph\.instagram\.com/);
  });

  it("rewrites Facebook Graph message URLs onto Instagram Login", () => {
    assert.equal(
      rewriteInstagramMessagesHost("https://graph.facebook.com/v21.0/17841435877386136/messages"),
      "https://graph.instagram.com/v21.0/17841435877386136/messages",
    );
  });
});
