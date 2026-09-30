import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  InfobipSmsApiClient,
  mapInfobipMessageStatus,
  normalizeInfobipBaseUrl,
} from "./infobip-sms-api-client.js";

describe("Infobip SMS API client", () => {
  it("normalizes base URL and defaults to api.infobip.com", () => {
    assert.equal(normalizeInfobipBaseUrl(""), "https://api.infobip.com");
    assert.equal(normalizeInfobipBaseUrl("https://xyz.api.infobip.com/"), "https://xyz.api.infobip.com");
  });

  it("maps delivery statuses into ValueOR statuses", () => {
    assert.equal(mapInfobipMessageStatus("PENDING_ACCEPTED"), "pending");
    assert.equal(mapInfobipMessageStatus("DELIVERED_TO_HANDSET"), "delivered");
    assert.equal(mapInfobipMessageStatus("REJECTED"), "failed");
  });

  it("sends SMS with App auth and returns messageId", async () => {
    let capturedAuth = "";
    const client = new InfobipSmsApiClient({
      fetchFn: async (_url, init) => {
        capturedAuth = String((init?.headers as Record<string, string>)?.Authorization ?? "");
        return new Response(
          JSON.stringify({
            messages: [{ messageId: "infobip-msg-1", status: { name: "PENDING_ACCEPTED" } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    const result = await client.sendMessage(
      {
        provider: "infobip",
        apiKey: "secret-key",
        baseUrl: "https://api.infobip.com",
        fromNumber: "ValueOR",
      },
      { to: "+15551234567", from: "ValueOR", body: "Hello" },
    );

    assert.equal(capturedAuth, "App secret-key");
    assert.equal(result.messageId, "infobip-msg-1");
    assert.equal(result.status, "PENDING_ACCEPTED");
  });

  it("normalizes provider HTTP failures without leaking the API key", async () => {
    const client = new InfobipSmsApiClient({
      fetchFn: async () =>
        new Response(
          JSON.stringify({
            requestError: { serviceException: { text: "Unauthorized", messageId: "UNAUTHORIZED" } },
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
    });

    await assert.rejects(
      () =>
        client.sendMessage(
          {
            provider: "infobip",
            apiKey: "super-secret-key",
            baseUrl: "https://api.infobip.com",
            fromNumber: "ValueOR",
          },
          { to: "+15551234567", from: "ValueOR", body: "Hello" },
        ),
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        assert.doesNotMatch(message, /super-secret-key/);
        return true;
      },
    );
  });

  it("testConnection succeeds only after authenticated balance check", async () => {
    const client = new InfobipSmsApiClient({
      fetchFn: async () =>
        new Response(JSON.stringify({ balance: 10, currency: "EUR" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    });
    const ok = await client.testConnection({
      apiKey: "key",
      baseUrl: "https://api.infobip.com",
    });
    assert.equal(ok.ok, true);
    assert.match(String(ok.accountName), /Infobip/);
  });

  it("testConnection fails on auth errors", async () => {
    const client = new InfobipSmsApiClient({
      fetchFn: async () => new Response("denied", { status: 401 }),
    });
    const result = await client.testConnection({
      apiKey: "bad",
      baseUrl: "https://api.infobip.com",
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "provider_auth_failed");
  });
});
