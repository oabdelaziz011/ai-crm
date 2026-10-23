import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.VITE_SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??= "test-publishable-key";
process.env.VITE_API_SERVER_URL ??= "http://127.0.0.1:9";

describe("omnichannel outbound api client", () => {
  it("names provider_acceptance_unconfirmed and does not call the provider again", async () => {
    const calls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("graph.facebook.com")) {
        throw new Error("meta_network_forbidden");
      }
      if (!url.includes("/omnichannel/outbound/dispatch")) {
        return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(
        JSON.stringify({
          error: "provider_acceptance_unconfirmed",
          message: "provider accepted but local delivery update failed",
        }),
        { status: 409, headers: { "content-type": "application/json" } },
      );
    };

    try {
      const { dispatchOmnichannelOutboundViaApi } = await import(
        "./omnichannel-outbound-api-client.ts"
      );
      await assert.rejects(
        () =>
          dispatchOmnichannelOutboundViaApi({
            companyId: "company-isolated",
            conversationId: "conv-isolated",
            companyChannelId: "cc-isolated",
            channelKey: "whatsapp",
            channelSessionId: "session-isolated",
            externalThreadId: "15550001111",
            text: "isolated",
            outboundMessageId: "msg-isolated",
            persistConversationMessage: false,
          }),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.equal(error.name, "ProviderAcceptanceUnconfirmedError");
          return true;
        },
      );
      const dispatchCalls = calls.filter((url) => url.includes("/omnichannel/outbound/dispatch"));
      assert.equal(dispatchCalls.length, 1);
      assert.equal(calls.some((url) => url.includes("graph.facebook.com")), false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
