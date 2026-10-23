import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openWebsiteChatSession, sendWebsiteChatMessage, websiteChatMessageId } from "./website-chat-client.js";

describe("website chat client", () => {
  it("opens a session without sending a company id", async () => {
    let captured = "";
    const result = await openWebsiteChatSession({
      apiBaseUrl: "http://localhost:3000/",
      publicKey: `wcw_${"a".repeat(48)}`,
      locale: "ar",
      fetchImpl: async (url, init) => {
        captured = `${url}\n${String(init?.body)}`;
        return new Response(JSON.stringify({
          session: { id: "11111111-1111-4111-8111-111111111111" },
          visitorToken: `wct_${"b".repeat(40)}`,
          widget: { greeting: "أهلاً" },
        }), { status: 201 });
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.greeting, "أهلاً");
    assert.match(captured, /\/api\/public\/web-chat\/wcw_/);
    assert.doesNotMatch(captured, /company_id/);
    assert.match(captured, /"locale":"ar"/);
  });

  it("asks for a person on the same session", async () => {
    let body = "";
    const result = await sendWebsiteChatMessage({
      apiBaseUrl: "http://localhost:3000",
      sessionId: "11111111-1111-4111-8111-111111111111",
      visitorToken: "wct_token",
      text: "I would like to speak with someone.",
      clientMessageId: websiteChatMessageId(),
      requestHuman: true,
      fetchImpl: async (_url, init) => {
        body = String(init?.body);
        return new Response(JSON.stringify({ status: "handoff", notice: "A team member will be with you shortly." }), { status: 200 });
      },
    });
    assert.equal(result.ok && result.value.status, "handoff");
    assert.match(body, /"request_human":true/);
    assert.doesNotMatch(body, /company_id/);
  });
});
